// End-to-end test of POST /api/report/email against the REAL gateway process, with a mock Supabase (the member directory) and a
// mock n8n webhook. Nothing live is touched.   node --test services/auth-gateway/report.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = 'test-jwt-secret-test-jwt-secret-1234';
const HOOK_SECRET = 'hook-secret-for-the-test';
const DOMAIN = 'users.insights.codeine.cloud';
const U = { real: '00000000-0000-4000-8000-000000000001', contact: '00000000-0000-4000-8000-000000000002', none: '00000000-0000-4000-8000-000000000003',
  limit: '00000000-0000-4000-8000-000000000004', stranger: '00000000-0000-4000-8000-000000000009' };
const rows = [
  { username: 'real', auth_email: 'real@example.com', contact_email: null, user_id: U.real, is_admin: false },
  { username: 'contact', auth_email: `contact@${DOMAIN}`, contact_email: 'Contact.Person@example.org', user_id: U.contact, is_admin: false },
  { username: 'none', auth_email: `none@${DOMAIN}`, contact_email: null, user_id: U.none, is_admin: false },
  { username: 'limit', auth_email: 'limit@example.com', contact_email: null, user_id: U.limit, is_admin: false },
];
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function token(sub, { exp = Math.floor(Date.now() / 1000) + 3600, secret = JWT_SECRET, role = 'authenticated' } = {}) {
  const h = b64u({ alg: 'HS256', typ: 'JWT' }), p = b64u({ sub, role, exp });
  return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
}
const listen = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });

let supabase, n8n, gw, gwOff, hookMode = 'ok';
const hookCalls = [];
let PORT, PORT_OFF;
const procs = [];
async function startGateway(env) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = spawn(process.execPath, [join(here, 'server.mjs')], { env: { ...process.env, PORT: String(port), SUPABASE_INTERNAL_URL: `http://127.0.0.1:${supabase.address().port}`,
    SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_JWT_SECRET: JWT_SECRET, AUTH_USERNAME_DOMAIN: DOMAIN, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(p);
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if ((await r.json()).ok) return port; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('gateway did not start');
}
before(async () => {
  supabase = await listen((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.includes('login_directory')) return res.end(JSON.stringify(rows));
    res.statusCode = 404; res.end('{}');
  });
  n8n = await listen((req, res) => {
    let raw = ''; req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      hookCalls.push({ headers: req.headers, body: JSON.parse(raw || '{}'), url: req.url });
      res.setHeader('Content-Type', 'application/json');
      if (hookMode === 'fail') { res.statusCode = 500; return res.end('{"message":"boom"}'); }
      res.end(JSON.stringify({ ok: true }));
    });
  });
  PORT = await startGateway({ REPORT_WEBHOOK_URL: `http://127.0.0.1:${n8n.address().port}/webhook/report`, REPORT_WEBHOOK_SECRET: HOOK_SECRET });
  PORT_OFF = await startGateway({});
});
after(() => { procs.forEach((p) => p.kill()); supabase.close(); n8n.close(); });

const HTML = '<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:P;src:url(data:font/woff2;base64,AAAA/onZZ=) format("woff2")}a{color:red}</style></head><body><p>hello</p></body></html>';
const good = (over = {}) => ({ subject: 'What US$1,000,000 would have become', summary: 'If you had put it in.', filenameBase: 'OffShore-Insights_Netherlands', html: HTML, xlsxBase64: 'UEsDBA==', ...over });
// Each request comes from its own client address (X-Real-IP), so the gateway's per-IP limiter (30 a minute) does not mix into these tests.
let ipCounter = 0;
const post = (tok, body, port = PORT) => fetch(`http://127.0.0.1:${port}/api/report/email`, { method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Real-IP': `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`, ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
  body: typeof body === 'string' ? body : JSON.stringify(body) });

test('no token, a forged token, a wrong-secret token and an expired token are all 401', async () => {
  assert.equal((await post(null, good())).status, 401);
  assert.equal((await post('x.y.z-not-a-real-token-value', good())).status, 401);
  assert.equal((await post(token(U.real, { secret: 'another-secret-another-secret-123456' }), good())).status, 401);
  assert.equal((await post(token(U.real, { exp: Math.floor(Date.now() / 1000) - 10 }), good())).status, 401);
  assert.equal((await post(token(U.real, { role: 'anon' }), good())).status, 401);
});

test('a valid login that is not an active member is 403, and nothing is forwarded', async () => {
  hookCalls.length = 0;
  assert.equal((await post(token(U.stranger), good())).status, 403);
  assert.equal(hookCalls.length, 0);
});

test('a member gets the report mailed to their own address; the secret goes with it; the body cannot choose the recipient', async () => {
  hookCalls.length = 0;
  const r = await post(token(U.real), { ...good(), to: 'attacker@evil.example', cc: 'attacker@evil.example' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, sentTo: 'r***@example.com' });
  assert.equal(hookCalls.length, 1);
  const c = hookCalls[0];
  assert.equal(c.headers['x-report-secret'], HOOK_SECRET);
  assert.equal(c.url, '/webhook/report');
  assert.equal(c.body.to, 'real@example.com');
  assert.equal(c.body.cc, undefined);
  assert.equal(c.body.requestedBy, 'real');
  assert.equal(c.body.html, HTML);
  assert.equal(c.body.xlsxBase64, 'UEsDBA==');
});

test('a contact email wins over the sign-in email; a made-up sign-in email is never used', async () => {
  hookCalls.length = 0;
  const r = await post(token(U.contact), good());
  assert.equal(r.status, 200);
  assert.equal(hookCalls[0].body.to, 'Contact.Person@example.org');
  hookCalls.length = 0;
  const n = await post(token(U.none), good());
  assert.equal(n.status, 409);
  assert.equal((await n.json()).error, 'no_email');
  assert.equal(hookCalls.length, 0);
});

test('anything that could load or run something is refused', async () => {
  hookCalls.length = 0;
  const bad = [
    '<!doctype html><html><body><script>alert(1)</script></body></html>',
    '<!doctype html><html><body><img src="http://192.168.0.50:8025/api/v1/messages"></body></html>',
    '<!doctype html><html><body><iframe src="http://localhost:5678"></iframe></body></html>',
    '<!doctype html><html><head><link rel="stylesheet" href="http://x/y.css"></head></html>',
    '<!doctype html><html><head><style>@import "http://x/y.css";</style></head></html>',
    '<!doctype html><html><head><style>a{background:url(http://169.254.169.254/latest)}</style></head></html>',
    '<!doctype html><html><head><style>a{background:url( "//evil/x")}</style></head></html>',
    '<!doctype html><html><body onload="x()">hi</body></html>',
    '<!doctype html><html><body><a href="javascript:x()">hi</a></body></html>',
    '<html><body>not a doctype</body></html>',
  ];
  for (const html of bad) {
    const r = await post(token(U.real), good({ html }));
    assert.equal(r.status, 400, html.slice(0, 60));
  }
  assert.equal(hookCalls.length, 0);
});

test('malformed fields are 400: header injection in the subject, a bad file name, bad base64, missing parts', async () => {
  assert.equal((await post(token(U.real), good({ subject: 'Hello\r\nBcc: x@y.z' }))).status, 400);
  assert.equal((await post(token(U.real), good({ filenameBase: '../../etc/passwd' }))).status, 400);
  assert.equal((await post(token(U.real), good({ xlsxBase64: 'not base64 !!' }))).status, 400);
  assert.equal((await post(token(U.real), { ...good(), html: undefined })).status, 400);
  assert.equal((await post(token(U.real), 'not json')).status, 400);
});

test('an oversize body is 413', async () => {
  const r = await post(token(U.real), good({ html: HTML + 'x'.repeat(7 * 1024 * 1024) }));
  assert.equal(r.status, 413);
});

test('six reports in an hour: the sixth is 429 with Retry-After', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await post(token(U.limit), good())).status, 200, 'send ' + (i + 1));
  const r = await post(token(U.limit), good());
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  assert.equal((await r.json()).error, 'too_many_reports');
  assert.equal((await post(token(U.real), good())).status, 200);          // another user is not affected
});

test('when n8n fails or is unreachable the answer is 502, not a success', async () => {
  hookMode = 'fail';
  const r = await post(token(U.contact), good());
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error, 'mail_failed');
  hookMode = 'ok';
});

test('without the webhook configured the endpoint says so (503)', async () => {
  const r = await post(token(U.real), good(), PORT_OFF);
  assert.equal(r.status, 503);
});
