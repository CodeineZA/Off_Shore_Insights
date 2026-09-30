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
import http from 'node:http';

const PORT = Number(process.env.PORT || 8080);
const SUPABASE = process.env.SUPABASE_INTERNAL_URL;          // e.g. http://host.docker.internal:8000
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCHEMA = process.env.SUPABASE_SCHEMA || 'offshore_insights';
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
  maxBody: 1024,
};

// ── Directory cache ───────────────────────────────────────────────────────────
let directory = new Map();   // username → auth email
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
    directory = new Map(rows.map((r) => [r.username, r.auth_email]));
    directoryAt = Date.now();
  } catch (e) {
    console.error('directory refresh failed (keeping last good copy):', e.message);
  }
}
await refreshDirectory();
setInterval(refreshDirectory, LIMITS.directoryRefreshMs).unref();

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

async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > LIMITS.maxBody) throw new Error('too_large'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function login(req, res) {
  const ip = clientIp(req);
  if (ipReqs.blocked(ip)) return tooMany(res, ipReqs.retryAfterS(ip));
  ipReqs.add(ip);
  if (ipFails.blocked(ip)) return tooMany(res, ipFails.retryAfterS(ip));

  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: 'bad_request' }); }
  const username = String(body?.username ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (!username || !password || username.length > 32 || password.length > 256) return send(res, 400, { error: 'bad_request' });

  if (userFails.blocked(username)) return tooMany(res, userFails.retryAfterS(username));

  // Unknown or disabled → reject from memory. No DB, no GoTrue.
  const email = directory.get(username);
  // (Not counted per username: that map would only grow with junk names.)
  if (!email) { ipFails.add(ip); return invalid(res); }

  // Global budget: protects GoTrue/bcrypt/Postgres from a distributed attack.
  if (global.blocked('all') || inFlight >= LIMITS.maxConcurrentGotrue) return tooMany(res, 30);
  global.add('all'); inFlight++;
  try {
    const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
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

http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'POST' && url === '/api/login') return void login(req, res);
  if (req.method === 'GET' && url === '/api/health') {
    return send(res, 200, { ok: directoryAt > 0, users: directory.size,
      directoryAgeS: directoryAt ? Math.round((Date.now() - directoryAt) / 1000) : null });
  }
  send(res, 404, { error: 'not_found' });
}).listen(PORT, () => console.log(`auth-gateway on :${PORT}, ${directory.size} users cached`));
