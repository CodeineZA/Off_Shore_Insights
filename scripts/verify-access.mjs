#!/usr/bin/env node
// End-to-end access checks against the live API. Re-run after any schema/RLS change.
//   node scripts/verify-access.mjs
// Uses the reusable test user (TEST_USER_* in .env) and a throwaway non-member
// login that is created and deleted during the run. Members log in through the
// login gateway (GATEWAY_URL, default SITE_URL), never straight at the database.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const GW = process.env.GATEWAY_URL || env.SITE_URL;
const U = env.SUPABASE_URL, ANON = env.SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY, S = env.SUPABASE_SCHEMA;

let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → ${got}`}`); if (!ok) failed++; };

async function req(path, { key = ANON, jwt, method = 'GET', body, profile = true } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${jwt || key}`, 'Content-Type': 'application/json' };
  if (profile) Object.assign(headers, { 'Accept-Profile': S, 'Content-Profile': S, Prefer: 'return=representation' });
  const res = await fetch(U + path, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
const rows = (r) => (Array.isArray(r.json) ? r.json.length : -1);
const resolve = async (u, key = ANON) => req('/rest/v1/rpc/resolve_login', { key, method: 'POST', body: { p_username: u } });
async function gatewayLogin(username, password) {
  const res = await fetch(`${GW}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }) });
  return { status: res.status, json: await res.json().catch(() => null) };
}
// Direct GoTrue sign-in: ONLY to simulate an outsider holding some other app's login.
async function directSignIn(email, password) {
  const r = await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, profile: false });
  if (!r.json.access_token) throw new Error(`sign-in failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.access_token;
}
const TABLES = ['jurisdiction', 'tax_type', 'tax_rate', 'treaty', 'wealth_market', 'jurisdiction_note',
  'review_flag', 'sync_run', 'site_page', 'search_daily', 'search_query_monthly', 'analytics_daily', 'app_user',
  'jurisdiction_gate', 'fx_rate'];
const RATES ='/rest/v1/v_current_rates?select=jurisdiction_code,headline_rate&jurisdiction_code=in.(FR,ES)&headline_rate=not.is.null';

// 1. anon
const a = await req(RATES);
check('anon cannot read v_current_rates', a.status >= 400 || rows(a) === 0, `${a.status} ${JSON.stringify(a.json).slice(0, 120)}`);
const a2 = await req('/rest/v1/tax_rate?select=id');
check('anon cannot read tax_rate', a2.status >= 400 || rows(a2) === 0, a2.status);

// 2. login path
const ar = await resolve(env.TEST_USER_USERNAME);
check('anon cannot call resolve_login (no pre-auth DB path)', ar.status >= 400, `${ar.status} ${JSON.stringify(ar.json)}`);
const bad = await gatewayLogin(env.TEST_USER_USERNAME, 'wrong-password-' + randomBytes(4).toString('hex'));
check('gateway rejects a wrong password (401)', bad.status === 401, `${bad.status} ${JSON.stringify(bad.json)}`);
const byEmail = await gatewayLogin(`${env.TEST_USER_USERNAME}@${env.AUTH_USERNAME_DOMAIN}`.toUpperCase(), env.TEST_USER_PASSWORD);
check('gateway accepts the login email too (any case)', byEmail.status === 200 && !!byEmail.json?.access_token, byEmail.status);
const unk = await gatewayLogin('no-such-user-' + randomBytes(3).toString('hex'), 'x');
check('gateway rejects an unknown username (401)', unk.status === 401, unk.status);
const ok = await gatewayLogin(env.TEST_USER_USERNAME, env.TEST_USER_PASSWORD);
const jwt = ok.json?.access_token;
check('test user logs in through the gateway', ok.status === 200 && !!jwt, `${ok.status} ${JSON.stringify(ok.json)}`);
if (!jwt) { console.log('\ncannot continue without a session'); process.exit(1); }

// 3. member reads, cannot write
const m = await req(RATES, { jwt });
check('member reads FR/ES current rates', rows(m) > 0, `${m.status} ${rows(m)}`);
const dash = await req('/rest/v1/rpc/dashboard', { jwt, method: 'POST', body: {} });
check('member dashboard() returns rates + jurisdictions', dash.status === 200 && dash.json.rates?.length > 0 && dash.json.jurisdictions?.length > 0, dash.status);
const anonDash = await req('/rest/v1/rpc/dashboard', { method: 'POST', body: {} });
check('anon cannot call dashboard()', anonDash.status >= 400, anonDash.status);
const w = await req('/rest/v1/tax_rate', { jwt, method: 'POST', body: {
  jurisdiction_code: 'FR', tax_type_code: 'INCOME_TOP', headline_rate: 1, valid_from: '2026-01-01',
  verified_on: '2026-01-01', next_check_on: '2026-01-01' } });
check('member write to tax_rate is rejected', w.status >= 400, w.status);
const own = await req('/rest/v1/app_user?select=username', { jwt });
check('member sees only own app_user row', rows(own) === 1 && own.json[0].username === env.TEST_USER_USERNAME, JSON.stringify(own.json));

// 4. non-member login (throwaway) sees nothing
const tmpEmail = `nonmember-${randomBytes(4).toString('hex')}@${env.AUTH_USERNAME_DOMAIN}`;
const tmpPass = randomBytes(18).toString('base64url');
const created = await req('/auth/v1/admin/users', { key: SR, method: 'POST', profile: false,
  body: { email: tmpEmail, password: tmpPass, email_confirm: true } });
try {
  const njwt = await directSignIn(tmpEmail, tmpPass);
  const n = await req(RATES, { jwt: njwt });
  check('logged-in NON-member reads 0 rows from v_current_rates', rows(n) === 0, `${n.status} ${rows(n)}`);
  // Each table directly: a view can hide a leaky table policy behind a locked join.
  const leaks = [];
  for (const t of TABLES) {
    const r = await req(`/rest/v1/${t}?select=*&limit=1`, { jwt: njwt });
    if (rows(r) !== 0) leaks.push(`${t}(${r.status}/${rows(r)})`);
  }
  check(`logged-in NON-member reads 0 rows from all ${TABLES.length} tables`, leaks.length === 0, leaks.join(' '));
  const nd = await req('/rest/v1/rpc/dashboard', { jwt: njwt, method: 'POST', body: {} });
  const ndLeak = nd.status === 200 ? Object.entries(nd.json).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => k + '=' + v.length) : [];
  check('logged-in NON-member gets an empty dashboard()', nd.status >= 400 || ndLeak.length === 0, ndLeak.join(' ') || nd.status);
} finally {
  await req(`/auth/v1/admin/users/${created.json.id}`, { key: SR, method: 'DELETE', profile: false });
}

// 5. service_role writes
const s = await req('/rest/v1/sync_run', { key: SR, method: 'POST', body: { workflow: 'verify_access', status: 'ok', rows: 0, finished_at: new Date().toISOString() } });
check('service_role can write', s.status === 201, `${s.status} ${JSON.stringify(s.json)}`);
if (s.status === 201) await req(`/rest/v1/sync_run?id=eq.${s.json[0].id}`, { key: SR, method: 'DELETE' });

// 6. disabled member is locked out (then re-enabled)
const patch = (disabled) => req(`/rest/v1/app_user?username=eq.${env.TEST_USER_USERNAME}`, { key: SR, method: 'PATCH', body: { disabled } });
await patch(true);
try {
  const d = await req(RATES, { jwt });
  check('disabled member reads 0 rows (same token)', rows(d) === 0, `${d.status} ${rows(d)}`);
  const dr = await resolve(env.TEST_USER_USERNAME, SR);
  check('resolve_login(disabled) is null (service role)', dr.json === null, JSON.stringify(dr.json));
} finally {
  await patch(false);
}
const back = await req(RATES, { jwt });
check('re-enabled member reads again', rows(back) > 0, rows(back));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
