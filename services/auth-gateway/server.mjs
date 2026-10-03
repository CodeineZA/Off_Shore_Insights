// Off_Shore_Insights login gateway. No dependencies (Node 22).
//
// Why: login must never hit the database per attempt (DoS protection for the Pi).
//  - The username directory is cached IN MEMORY, refreshed on a timer (not per request).
//    Unknown/disabled usernames are rejected without touching Postgres or GoTrue.
//  - All rate limiting is IN MEMORY (per IP, per username, global budget + concurrency).
//    Never DB-backed: a DB-backed limiter is itself a DoS vector (Weave 2026-08-13).
//  - Only a known username within its limits costs one GoTrue call (bcrypt + DB lookup).
//
// POST /api/login  {"username","password"}  → GoTrue session JSON | 401 | 429 | 503
// GET  /api/health                          → {"ok":true,"users":N,"directoryAgeS":N}
//
// User management (admin only, i.e. Hentus). The caller's access token is verified HERE
// (HS256, shared JWT secret) and its user must be an admin in the in-memory directory, so a
// forged or non-admin request is rejected from memory; only then is the database touched.
// Emailed reports (any active member). The report PDF + Excel are built in the browser; this endpoint checks the token,
// picks the recipient ITSELF (the signed-in user's own address, never one from the request), caps size and rate, refuses
// anything that is not plain static HTML, and hands the job to the n8n workflow, which renders the PDF and sends the mail.
// POST   /api/report/email       {subject, summary, filenameBase, html, xlsxBase64} → {ok:true, sentTo:"a***@x.com"}
//
// GET    /api/admin/users        → [{user_id, username, display_name, email, cell, password, …}]
// POST   /api/admin/users        {username, password, email?, cell?, display_name?}
// PATCH  /api/admin/users/:id    any of {username, password, email, cell, display_name, disabled}
// DELETE /api/admin/users/:id    created here → login deleted too; linked login → access removed only
import http from 'node:http';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
const SUPABASE = process.env.SUPABASE_INTERNAL_URL;          // e.g. http://host.docker.internal:8000
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCHEMA = process.env.SUPABASE_SCHEMA || 'offshore_insights';
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;          // admin endpoints are off without it
const DOMAIN = process.env.AUTH_USERNAME_DOMAIN || 'users.insights.codeine.cloud';
const REPORT_HOOK = process.env.REPORT_WEBHOOK_URL;          // the n8n webhook that renders and sends a report
const REPORT_SECRET = process.env.REPORT_WEBHOOK_SECRET;     // shared with that webhook's header-auth credential
if (!SUPABASE || !ANON || !SERVICE) { console.error('missing SUPABASE_INTERNAL_URL / keys'); process.exit(1); }

const MIN = 60_000;
const LIMITS = {
  directoryRefreshMs: 60_000,
  ipFails: 10, ipWindowMs: 15 * MIN,          // failed logins per client IP
  ipRequests: 30, ipReqWindowMs: 1 * MIN,     // any login request per client IP
  userFails: 5, userWindowMs: 15 * MIN,       // failed logins per username
  globalGotruePerMin: 20,                     // total password checks reaching GoTrue
  maxConcurrentGotrue: 2,
  maxTracked: 50_000,                         // cap on limiter map size (memory DoS guard)
  maxBody: 8192,                              // a 1000-character password in 4-byte characters fits
  maxReportBody: 6 * 1024 * 1024,             // the report HTML (about 0.3 MB) + the Excel (about 25 kB) as base64, with room
  reportsPerHour: 5,                          // emailed reports per user
  maxPassword: 1000,                          // characters; anything else goes (Hentus: any size, any combination)
};

// ── Directory cache ───────────────────────────────────────────────────────────
// login name (username, login email or contact email, lowercased) → { username, email }
let directory = new Map();
let admins = new Set();                                       // user_ids of active admins
let people = new Map();                                       // user_id → { username, contact, auth } of every active member
let directoryAt = 0;
async function refreshDirectory() {
  try {
    const res = await fetch(`${SUPABASE}/rest/v1/rpc/login_directory`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Profile': SCHEMA,
                 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const rows = await res.json();
    const next = new Map(), nextAdmins = new Set(), nextPeople = new Map();
    for (const r of rows) {
      const entry = { username: r.username, email: r.auth_email };
      for (const k of [r.username, r.auth_email, r.contact_email]) if (k) next.set(String(k).trim().toLowerCase(), entry);
      if (r.is_admin) nextAdmins.add(r.user_id);
      nextPeople.set(r.user_id, { username: r.username, contact: r.contact_email || null, auth: r.auth_email || null });
    }
    directory = next; admins = nextAdmins; people = nextPeople;
    directoryAt = Date.now();
  } catch (e) {
    console.error('directory refresh failed (keeping last good copy):', e.message);
  }
}
await refreshDirectory();
setInterval(refreshDirectory, LIMITS.directoryRefreshMs).unref();

// The auth service only takes 6 characters to 72 bytes (bcrypt reads 72 bytes; updates refuse
// under 6). A password outside that range is turned into a fixed 50-character value, the same way
// at login and when it is set, so any password works (Hentus: any size, any combination). Only
// logins made here may use that: a linked login (shared with e.g. Neil's Way, which signs in
// without this gateway) must stay inside the range.
const AUTH_MIN = 6, BCRYPT_MAX = 72;
const chars = (p) => [...p].length;              // characters as people count them (an emoji is one)
const nativeOk = (p) => chars(p) >= AUTH_MIN && Buffer.byteLength(p, 'utf8') <= BCRYPT_MAX;
const authPassword = (p) => (nativeOk(p) ? p : 'sha256:' + createHash('sha256').update(p, 'utf8').digest('base64url'));

// ── In-memory sliding-window counters ─────────────────────────────────────────
class Window {
  constructor(max, ms) { this.max = max; this.ms = ms; this.hits = new Map(); }
  prune(key, now) {
    const arr = (this.hits.get(key) || []).filter((t) => now - t < this.ms);
    if (arr.length) this.hits.set(key, arr); else this.hits.delete(key);
    return arr;
  }
  blocked(key, now = Date.now()) { return this.prune(key, now).length >= this.max; }
  retryAfterS(key, now = Date.now()) {
    const arr = this.prune(key, now);
    return arr.length ? Math.ceil((this.ms - (now - arr[0])) / 1000) : 0;
  }
  add(key, now = Date.now()) {
    if (!this.hits.has(key) && this.hits.size >= LIMITS.maxTracked) this.sweep(now);
    if (!this.hits.has(key) && this.hits.size >= LIMITS.maxTracked) return; // still full: don't grow
    const arr = this.prune(key, now); arr.push(now); this.hits.set(key, arr);
  }
  clear(key) { this.hits.delete(key); }
  sweep(now = Date.now()) { for (const k of [...this.hits.keys()]) this.prune(k, now); }
}
const ipReqs = new Window(LIMITS.ipRequests, LIMITS.ipReqWindowMs);
const ipFails = new Window(LIMITS.ipFails, LIMITS.ipWindowMs);
const userFails = new Window(LIMITS.userFails, LIMITS.userWindowMs);
const global = new Window(LIMITS.globalGotruePerMin, MIN);
setInterval(() => { const n = Date.now(); [ipReqs, ipFails, userFails, global].forEach((w) => w.sweep(n)); }, MIN).unref();
let inFlight = 0;

// ── HTTP ──────────────────────────────────────────────────────────────────────
function send(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}
const tooMany = (res, s) => send(res, 429, { error: 'too_many_attempts', retryAfterS: s }, { 'Retry-After': String(s) });
const invalid = (res) => send(res, 401, { error: 'invalid_login' });

function clientIp(req) {
  // Behind Cloudflare → cloudflared → nginx. nginx passes the real client IP in X-Real-IP.
  return String(req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown').slice(0, 64);
}

async function readJson(req, max = LIMITS.maxBody) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) throw new Error('too_large'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function login(req, res) {
  const ip = clientIp(req);
  if (ipReqs.blocked(ip)) return tooMany(res, ipReqs.retryAfterS(ip));
  ipReqs.add(ip);
  if (ipFails.blocked(ip)) return tooMany(res, ipFails.retryAfterS(ip));

  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: 'bad_request' }); }
  const login = String(body?.username ?? '').trim().toLowerCase(); // username or email
  const password = String(body?.password ?? '');
  if (!login || !password || login.length > 254 || chars(password) > LIMITS.maxPassword) return send(res, 400, { error: 'bad_request' });

  // Unknown or disabled → reject from memory. No DB, no GoTrue.
  // (Not counted per name: that map would only grow with junk names.)
  const entry = directory.get(login);
  if (!entry) { ipFails.add(ip); return invalid(res); }
  // Lockout is per account, whichever name (username or email) was typed.
  const username = entry.username, email = entry.email;
  if (userFails.blocked(username)) return tooMany(res, userFails.retryAfterS(username));

  // Global budget: protects GoTrue/bcrypt/Postgres from a distributed attack.
  if (global.blocked('all') || inFlight >= LIMITS.maxConcurrentGotrue) return tooMany(res, 30);
  global.add('all'); inFlight++;
  try {
    const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: authPassword(password) }),
      signal: AbortSignal.timeout(10_000),
    });
    const session = await r.json().catch(() => null);
    if (r.ok && session?.access_token) {
      ipFails.clear(ip); userFails.clear(username);
      return send(res, 200, session);
    }
    if (r.status === 400 || r.status === 401) { ipFails.add(ip); userFails.add(username); return invalid(res); }
    if (r.status === 429) return tooMany(res, 60);
    console.error('gotrue unexpected', r.status);
    return send(res, 503, { error: 'auth_unavailable' });
  } catch (e) {
    console.error('gotrue error', e.message);
    return send(res, 503, { error: 'auth_unavailable' });
  } finally { inFlight--; }
}

// Session renewal and sign-out also go through here, under the same in-memory limits,
// so the app never talks to GoTrue directly.
async function gotrue(path, init) {
  if (global.blocked('all') || inFlight >= LIMITS.maxConcurrentGotrue) return { status: 429 };
  global.add('all'); inFlight++;
  try {
    const r = await fetch(`${SUPABASE}/auth/v1${path}`, { ...init, signal: AbortSignal.timeout(10_000) });
    return { status: r.status, body: await r.json().catch(() => null) };
  } catch (e) {
    console.error('gotrue error', e.message);
    return { status: 503 };
  } finally { inFlight--; }
}

async function refresh(req, res) {
  const ip = clientIp(req);
  if (ipReqs.blocked(ip)) return tooMany(res, ipReqs.retryAfterS(ip));
  ipReqs.add(ip);
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: 'bad_request' }); }
  const token = String(body?.refresh_token ?? '');
  if (!token || token.length > 512) return send(res, 400, { error: 'bad_request' });
  const r = await gotrue('/token?grant_type=refresh_token', {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: token }) });
  if (r.status === 200 && r.body?.access_token) return send(res, 200, r.body);
  if (r.status === 429) return tooMany(res, 30);
  if (r.status === 503) return send(res, 503, { error: 'auth_unavailable' });
  return send(res, 401, { error: 'session_expired' });
}

async function logout(req, res) {
  const ip = clientIp(req);
  if (ipReqs.blocked(ip)) return tooMany(res, ipReqs.retryAfterS(ip));
  ipReqs.add(ip);
  const auth = String(req.headers.authorization || '');
  if (!/^Bearer [A-Za-z0-9._-]{20,2048}$/.test(auth)) return send(res, 204, {});
  await gotrue('/logout?scope=local', { method: 'POST', headers: { apikey: ANON, Authorization: auth } });
  return send(res, 204, {});
}

// ── User management (admin only) ──────────────────────────────────────────────
/** The token's user id if it is a valid, unexpired HS256 access token for this realm, else null. */
function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3 || !JWT_SECRET) return null;
  try {
    const head = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (head.alg !== 'HS256') return null;                    // never accept alg:none or others
    const want = createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest();
    const got = Buffer.from(parts[2], 'base64url');
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (p.role !== 'authenticated' || typeof p.sub !== 'string' || !(p.exp * 1000 > Date.now())) return null;
    return p.sub;
  } catch { return null; }
}

async function svc(path, init = {}) {
  const r = await fetch(SUPABASE + path, { ...init, signal: AbortSignal.timeout(10_000),
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...init.headers } });
  const text = await r.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: r.ok, status: r.status, body };
}
const rest = (path, init = {}) => svc(`/rest/v1/${path}`, { ...init,
  headers: { 'Accept-Profile': SCHEMA, 'Content-Profile': SCHEMA, Prefer: 'return=representation', ...init.headers } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const synthetic = (username) => `${username}@${DOMAIN}`;
class Bad extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }

/** Validate and normalise the editable fields that are present in `b`. */
function fields(b, { create }) {
  const out = {};
  const str = (k) => (b[k] === undefined ? undefined : b[k] === null ? '' : String(b[k]).trim());
  const username = str('username');
  if (username !== undefined || create) {
    const u = (username || '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(u)) throw new Bad(400, 'bad_username', 'Username: 2–32 characters, a–z 0–9 . _ - (starting with a letter or digit).');
    out.username = u;
  }
  const email = str('email');
  if (email !== undefined) {
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Bad(400, 'bad_email', 'That email address does not look valid.');
    out.email = email ? email.toLowerCase() : null;
  }
  const cell = str('cell');
  if (cell !== undefined) {
    if (cell && !/^\+?[0-9 ()-]{5,32}$/.test(cell)) throw new Bad(400, 'bad_cell', 'Cell: digits, spaces, ( ) - and an optional leading +.');
    out.cell = cell || null;
  }
  const display = str('display_name');
  if (display !== undefined) {
    if (display.length > 80) throw new Bad(400, 'bad_name', 'Name: at most 80 characters.');
    out.display_name = display || null;
  }
  if (b.password !== undefined || create) {
    const p = String(b.password ?? '');
    if (!p.length || chars(p) > LIMITS.maxPassword) throw new Bad(400, 'bad_password', `Password: 1 to ${LIMITS.maxPassword} characters, anything goes.`);
    out.password = p;
  }
  if (b.disabled !== undefined) out.disabled = !!b.disabled;
  return out;
}

async function authUpdate(id, body) {
  const r = await svc(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  if (r.status === 422 && /already|exists|registered/i.test(JSON.stringify(r.body))) throw new Bad(409, 'email_in_use', 'That email already has a login in the shared realm (e.g. Neil\'s Way).');
  if (!r.ok) throw new Error(`auth update ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
}
async function savePassword(id, password) {
  const r = await rest('app_user_password?on_conflict=user_id', { method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: id, password, set_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error(`save password ${r.status}`);
}
const dupUsername = (r) => r.status === 409 || /duplicate key|unique/i.test(JSON.stringify(r.body));

async function listUsers() {
  const r = await svc('/rest/v1/rpc/admin_users', { method: 'POST', body: '{}', headers: { 'Content-Profile': SCHEMA } });
  if (!r.ok) throw new Error(`admin_users ${r.status}`);
  return r.body;
}

async function createUser(b) {
  const f = fields(b, { create: true });
  if (directory.has(f.username)) throw new Bad(409, 'username_taken', 'That username is taken.');
  const created = await svc('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({
    email: f.email || synthetic(f.username), password: authPassword(f.password), email_confirm: true,
    user_metadata: { app: 'offshore_insights', username: f.username } }) });
  if (created.status === 422 && /already|exists|registered/i.test(JSON.stringify(created.body))) throw new Bad(409, 'email_in_use', 'That email already has a login in the shared realm (e.g. Neil\'s Way).');
  if (!created.ok || !created.body?.id) throw new Error(`auth create ${created.status}`);
  const id = created.body.id;
  const row = await rest('app_user', { method: 'POST', body: JSON.stringify({ user_id: id, username: f.username,
    display_name: f.display_name ?? null, email: f.email ?? null, cell: f.cell ?? null, created_here: true }) });
  if (!row.ok) {
    await svc(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });   // no orphan login
    if (dupUsername(row)) throw new Bad(409, 'username_taken', 'That username is taken.');
    throw new Error(`app_user insert ${row.status}`);
  }
  await savePassword(id, f.password);
  return id;
}

async function updateUser(id, b, self) {
  const f = fields(b, { create: false });
  const cur = (await rest(`app_user?user_id=eq.${id}&select=*`)).body?.[0];
  if (!cur) throw new Bad(404, 'not_found', 'No such user.');
  if (id === self && f.disabled) throw new Bad(400, 'self', 'You cannot disable your own account.');
  const patch = {};
  for (const k of ['username', 'display_name', 'email', 'cell', 'disabled']) if (f[k] !== undefined && f[k] !== cur[k]) patch[k] = f[k];
  if (Object.keys(patch).length) {
    const r = await rest(`app_user?user_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    if (!r.ok) { if (dupUsername(r)) throw new Bad(409, 'username_taken', 'That username is taken.'); throw new Error(`app_user patch ${r.status}`); }
  }
  // The login itself. A linked login (shared realm) keeps its sign-in email: only its contact email changes here.
  const auth = {};
  if (cur.created_here && ('email' in patch || 'username' in patch)) {
    const nextEmail = (f.email !== undefined ? f.email : cur.email) || synthetic(patch.username ?? cur.username);
    auth.email = nextEmail; auth.email_confirm = true;
  }
  if (f.password !== undefined) {
    if (!cur.created_here && !nativeOk(f.password)) throw new Bad(400, 'linked_password',
      'This login is shared with other apps (e.g. Neil\'s Way), which need 6 to 72 characters (fewer with emoji). Choose a password in that range for it.');
    auth.password = authPassword(f.password);
  }
  if (Object.keys(auth).length) {
    try { await authUpdate(id, auth); }
    catch (e) {                                                // keep app_user and the login consistent
      if (Object.keys(patch).length) {
        const undo = Object.fromEntries(Object.keys(patch).map((k) => [k, cur[k]]));
        await rest(`app_user?user_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(undo) });
      }
      throw e;
    }
  }
  if (f.password !== undefined) await savePassword(id, f.password);
}

async function deleteUser(id, self) {
  if (id === self) throw new Bad(400, 'self', 'You cannot delete your own account.');
  const cur = (await rest(`app_user?user_id=eq.${id}&select=created_here`)).body?.[0];
  if (!cur) throw new Bad(404, 'not_found', 'No such user.');
  const r = cur.created_here
    ? await svc(`/auth/v1/admin/users/${id}`, { method: 'DELETE' })          // cascades to app_user
    : await rest(`app_user?user_id=eq.${id}`, { method: 'DELETE' });         // shared login stays
  if (!r.ok) throw new Error(`delete ${r.status}`);
}

async function admin(req, res, url) {
  const ip = clientIp(req);
  if (ipReqs.blocked(ip)) return tooMany(res, ipReqs.retryAfterS(ip));
  ipReqs.add(ip);
  const m = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(String(req.headers.authorization || ''));
  const self = m && verifyToken(m[1]);
  if (!self) return send(res, 401, { error: 'unauthorized' });
  if (!admins.has(self)) return send(res, 403, { error: 'forbidden' });       // from memory: no DB for non-admins
  // Confirm against the database too (an admin removed < 60 s ago is still in the cache).
  const me = (await rest(`app_user?user_id=eq.${self}&select=is_admin,disabled`)).body?.[0];
  if (!me?.is_admin || me.disabled) return send(res, 403, { error: 'forbidden' });

  const id = url.slice('/api/admin/users'.length).replace(/^\//, '');
  if (id && !UUID.test(id)) return send(res, 404, { error: 'not_found' });
  try {
    if (req.method === 'GET' && !id) return send(res, 200, await listUsers());
    let body = {};
    if (req.method === 'POST' || req.method === 'PATCH') {
      try { body = await readJson(req, LIMITS.maxBody); } catch { return send(res, 400, { error: 'bad_request' }); }
      if (!body || typeof body !== 'object') return send(res, 400, { error: 'bad_request' });
    }
    if (req.method === 'POST' && !id) { const newId = await createUser(body); await refreshDirectory(); return send(res, 201, { user_id: newId }); }
    if (req.method === 'PATCH' && id) { await updateUser(id, body, self); await refreshDirectory(); return send(res, 200, { ok: true }); }
    if (req.method === 'DELETE' && id) { await deleteUser(id, self); await refreshDirectory(); return send(res, 200, { ok: true }); }
    return send(res, 405, { error: 'method_not_allowed' });
  } catch (e) {
    if (e instanceof Bad) return send(res, e.status, { error: e.code, message: e.message });
    console.error('admin', req.method, e.message);
    return send(res, 500, { error: 'server_error', message: 'Something went wrong on the server.' });
  }
}

// ── Emailed reports ───────────────────────────────────────────────────────────
const reportLimit = new Window(LIMITS.reportsPerHour, 60 * MIN);
setInterval(() => reportLimit.sweep(), MIN).unref();
/** a***@gmail.com: enough to recognise the address, not enough to learn it. */
const maskEmail = (e) => e.replace(/^(.).*(@.*)$/, (_, a, b) => `${a}***${b}`);
// The report is plain static HTML with inline CSS and inline (data:) fonts. Anything that could load or run something is refused:
// the page is rendered by a real browser engine on the Pi, which must never be pointed at another address.
const HTML_BAD = /<\s*(script|iframe|frame|object|embed|link|base|form|img|video|audio|source|meta\s+http-equiv)\b|@import|url\(\s*['"]?\s*(?:https?:|\/\/|file:|ftp:)|<[^>]*\son[a-z]+\s*=|javascript:/i;

async function reportEmail(req, res) {
  const ip = clientIp(req);
  if (ipReqs.blocked(ip)) return tooMany(res, ipReqs.retryAfterS(ip));
  ipReqs.add(ip);
  const m = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(String(req.headers.authorization || ''));
  const self = m && verifyToken(m[1]);
  if (!self) return send(res, 401, { error: 'unauthorized' });
  const me = people.get(self);
  if (!me) return send(res, 403, { error: 'forbidden' });                      // not an active member: from memory, no DB
  if (!REPORT_HOOK || !REPORT_SECRET) return send(res, 503, { error: 'not_configured', message: 'Emailing reports is not set up on the server yet.' });
  // The recipient is the signed-in user's own address: the contact email if one is set, else the sign-in email unless it is the made-up one.
  const to = me.contact || (me.auth && !me.auth.toLowerCase().endsWith('@' + DOMAIN.toLowerCase()) ? me.auth : null);
  if (!to) return send(res, 409, { error: 'no_email', message: 'There is no email address on your account. Ask the administrator to add one under User management, then try again.' });
  if (reportLimit.blocked(self)) {
    const s = reportLimit.retryAfterS(self);
    return send(res, 429, { error: 'too_many_reports', retryAfterS: s, message: `You have sent ${LIMITS.reportsPerHour} reports in the last hour. Try again in ${Math.ceil(s / 60)} minutes.` }, { 'Retry-After': String(s) });
  }
  let b;
  try { b = await readJson(req, LIMITS.maxReportBody); }
  catch (e) {
    // Reading stopped part-way, so this connection cannot be reused: tell the client to close it.
    if (e.message === 'too_large') return send(res, 413, { error: 'too_large', message: 'The report is too large to send.' }, { Connection: 'close' });
    return send(res, 400, { error: 'bad_request' });
  }
  const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
  const html = str(b?.html, 4_500_000), x = str(b?.xlsxBase64, 1_500_000);
  const subject = str(b?.subject, 200), summary = str(b?.summary, 800), base = str(b?.filenameBase, 120);
  if (!html || !x || !subject || !summary || !base) return send(res, 400, { error: 'bad_request', message: 'The report is incomplete.' });
  if (!/^<!doctype html>/i.test(html) || HTML_BAD.test(html)) return send(res, 400, { error: 'bad_html', message: 'The report contains something that is not allowed.' });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(x) || /[\r\n]/.test(subject) || !/^[A-Za-z0-9._-]+$/.test(base)) return send(res, 400, { error: 'bad_request', message: 'The report is malformed.' });
  reportLimit.add(self);                                                        // an attempt that reaches the mailer counts
  try {
    const r = await fetch(REPORT_HOOK, { method: 'POST', signal: AbortSignal.timeout(110_000),
      headers: { 'Content-Type': 'application/json', 'X-Report-Secret': REPORT_SECRET },
      body: JSON.stringify({ to, subject, summary, filenameBase: base, html, xlsxBase64: x, requestedBy: me.username }) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || out.ok !== true) { console.error('report mail failed:', r.status, JSON.stringify(out).slice(0, 200)); return send(res, 502, { error: 'mail_failed', message: 'The report could not be sent. Try again in a minute.' }); }
    return send(res, 200, { ok: true, sentTo: maskEmail(to) });
  } catch (e) {
    console.error('report mail error:', e.message);
    return send(res, 502, { error: 'mail_failed', message: 'The report could not be sent. Try again in a minute.' });
  }
}

http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  if (url === '/api/admin/users' || url.startsWith('/api/admin/users/')) return void admin(req, res, url);
  if (req.method === 'POST' && url === '/api/report/email') return void reportEmail(req, res);
  if (req.method === 'POST' && url === '/api/login') return void login(req, res);
  if (req.method === 'POST' && url === '/api/refresh') return void refresh(req, res);
  if (req.method === 'POST' && url === '/api/logout') return void logout(req, res);
  if (req.method === 'GET' && url === '/api/health') {
    return send(res, 200, { ok: directoryAt > 0, users: new Set([...directory.values()].map((e) => e.username)).size,
      directoryAgeS: directoryAt ? Math.round((Date.now() - directoryAt) / 1000) : null });
  }
  send(res, 404, { error: 'not_found' });
}).listen(PORT, () => console.log(`auth-gateway on :${PORT}, ${directory.size} users cached`));
