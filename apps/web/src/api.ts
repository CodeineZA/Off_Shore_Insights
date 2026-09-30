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
