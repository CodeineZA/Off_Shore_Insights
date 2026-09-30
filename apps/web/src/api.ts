// Session + data access. Login, refresh and logout go through the login gateway
// (/api/*, in-memory rate limits); data is one PostgREST call: rpc/dashboard.
import type { Dashboard } from './data/types';

const SUPABASE = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const SCHEMA = (import.meta.env.VITE_SUPABASE_SCHEMA as string) || 'offshore_insights';
const KEY = 'osi.session';

export interface Session { access_token: string; refresh_token: string; expires_at: number; email: string }
export class LoginError extends Error {
  constructor(public kind: 'invalid' | 'rate' | 'unavailable', public retryAfterS = 0) { super(kind); }
}
export class AuthExpired extends Error {}

export function loadSession(): Session | null {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s?.access_token ? s : null; } catch { return null; }
}
function saveSession(s: Session | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}
function toSession(j: { access_token: string; refresh_token: string; expires_at?: number; expires_in?: number; user?: { email?: string } }): Session {
  return { access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: j.expires_at ?? Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600), email: j.user?.email ?? '' };
}

export async function login(username: string, password: string): Promise<Session> {
  let res: Response;
  try {
    res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  } catch { throw new LoginError('unavailable'); }
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.access_token) { const s = toSession(body); saveSession(s); return s; }
  if (res.status === 401 || res.status === 400) throw new LoginError('invalid');
  if (res.status === 429) throw new LoginError('rate', Number(body.retryAfterS || res.headers.get('Retry-After') || 60));
  throw new LoginError('unavailable');
}

let refreshing: Promise<Session> | null = null;
export function refresh(s: Session): Promise<Session> {
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.access_token) { if (res.status === 401) saveSession(null); throw new AuthExpired(); }
      const next = toSession(body); saveSession(next); return next;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

export async function logout(s: Session | null) {
  saveSession(null);
  if (s) await fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${s.access_token}` } }).catch(() => {});
}

/** Fetch the whole dashboard payload, renewing the session when it is (nearly) expired. */
export async function fetchDashboard(s: Session): Promise<{ data: Dashboard; session: Session }> {
  let session = s;
  if (session.expires_at * 1000 - Date.now() < 60_000) session = await refresh(session);
  const call = (tok: string) => fetch(`${SUPABASE}/rest/v1/rpc/dashboard`, {
    method: 'POST', body: '{}',
    headers: { apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Profile': SCHEMA, 'Content-Type': 'application/json' },
  });
  let res = await call(session.access_token);
  if (res.status === 401) { session = await refresh(session); res = await call(session.access_token); }
  if (res.status === 401) throw new AuthExpired();
  if (!res.ok) throw new Error(`dashboard ${res.status}`);
  return { data: (await res.json()) as Dashboard, session };
}

// ── User management (admin only; the gateway checks the token and the admin flag) ──
export interface AdminUser {
  user_id: string; username: string; display_name: string | null; email: string | null; cell: string | null;
  disabled: boolean; is_admin: boolean; created_here: boolean; created_at: string; auth_email: string;
  last_sign_in_at: string | null; password: string | null; password_set_at: string | null;
}
export type UserFields = Partial<{ username: string; display_name: string; email: string; cell: string; password: string; disabled: boolean }>;
export class AdminError extends Error { constructor(public status: number, message: string) { super(message); } }

// Dev only (stripped from builds): ?fixture talks to an in-memory mock in vite.config.ts.
const FIXTURE = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('fixture');

async function adminCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = FIXTURE ? '/__fixture-admin/users' : '/api/admin/users';
  let s = loadSession();
  if (!FIXTURE) {
    if (!s) throw new AuthExpired();
    if (s.expires_at * 1000 - Date.now() < 60_000) s = await refresh(s);
  }
  const go = (tok: string) => fetch(base + path, { ...init,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) } });
  let res = await go(s?.access_token ?? '');
  if (res.status === 401 && s && !FIXTURE) { s = await refresh(s); res = await go(s.access_token); }
  if (res.status === 401) throw new AuthExpired();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AdminError(res.status, body.message
    || (res.status === 403 ? 'Only the administrator can manage users.' : res.status === 429 ? 'Too many requests: wait a minute and try again.' : 'The server could not do that. Try again.'));
  return body as T;
}
export const admin = {
  list: () => adminCall<AdminUser[]>(''),
  create: (f: UserFields) => adminCall<{ user_id: string }>('', { method: 'POST', body: JSON.stringify(f) }),
  update: (id: string, f: UserFields) => adminCall<{ ok: true }>(`/${id}`, { method: 'PATCH', body: JSON.stringify(f) }),
  remove: (id: string) => adminCall<{ ok: true }>(`/${id}`, { method: 'DELETE' }),
};
