#!/usr/bin/env node
// Manage who may use Off_Shore_Insights. Uses the service_role key from .env.
// No dependencies (Node 18+ fetch).
//
//   node scripts/user.mjs list
//   node scripts/user.mjs link   <username> --auth-email <existing login email> [--display "Name"] [--email e] [--cell c]
//   node scripts/user.mjs create <username> [--email e] [--cell c] [--display "Name"] [--env-key KEY]
//   node scripts/user.mjs reset  <username> [--env-key KEY]
//   node scripts/user.mjs disable|enable <username>
//
// `link` adds an EXISTING login from the shared Auth realm (same password as elsewhere).
// `create` makes a new login: real email if given, else <username>@AUTH_USERNAME_DOMAIN.
// Generated passwords are printed once, or written to .env under --env-key instead.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const URL_ = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY, SCHEMA = env.SUPABASE_SCHEMA;
const DOMAIN = env.AUTH_USERNAME_DOMAIN;
if (!URL_ || !KEY || !SCHEMA) die('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SCHEMA missing — run scripts/sync-env.sh');

const [cmd, username, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) opt[rest[i].slice(2)] = rest[++i];

function die(msg) { console.error(`user.mjs: ${msg}`); process.exit(1); }
process.on('unhandledRejection', (e) => die(e.message));
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function call(path, init = {}) {
  const res = await fetch(URL_ + path, { ...init, headers: { ...H, ...init.headers } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${text}`);
  return body;
}
const rest_ = (path, init = {}) => call(`/rest/v1/${path}`, {
  ...init, headers: { 'Accept-Profile': SCHEMA, 'Content-Profile': SCHEMA, Prefer: 'return=representation', ...init.headers },
});

async function findAuthUserByEmail(email) {
  for (let page = 1; page < 100; page++) {
    const { users } = await call(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const hit = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}
async function appUser(name) {
  const rows = await rest_(`app_user?username=eq.${encodeURIComponent(name)}&select=*`);
  return rows[0] || null;
}
function newPassword() { return randomBytes(18).toString('base64url'); }
function deliver(password) {
  if (!opt['env-key']) { console.log(`password: ${password}   (shown once — store it now)`); return; }
  const k = opt['env-key'];
  let text = readFileSync(envPath, 'utf8');
  const re = new RegExp(`^${k}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, `${k}=${password}`) : `${text.trimEnd()}\n${k}=${password}\n`;
  writeFileSync(envPath, text);
  console.log(`password written to .env as ${k}`);
}
function checkName(n) {
  if (!n || !/^[a-z0-9][a-z0-9._-]{1,31}$/.test(n)) die('username: 2–32 chars, lowercase a-z 0-9 . _ -');
}

switch (cmd) {
  case 'list': {
    const rows = await rest_('app_user?select=username,display_name,email,cell,disabled,created_at&order=username');
    console.table(rows);
    break;
  }
  case 'link': {
    checkName(username);
    if (!opt['auth-email']) die('link needs --auth-email');
    const u = await findAuthUserByEmail(opt['auth-email']);
    if (!u) die(`no existing login with email ${opt['auth-email']}`);
    await rest_('app_user?on_conflict=user_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ user_id: u.id, username, display_name: opt.display ?? null,
        email: opt.email ?? opt['auth-email'], cell: opt.cell ?? null, disabled: false }),
    });
    console.log(`linked ${username} → existing login ${opt['auth-email']}`);
    break;
  }
  case 'create': {
    checkName(username);
    if (await appUser(username)) die(`${username} already exists`);
    const email = opt.email || `${username}@${DOMAIN}`;
    const password = newPassword();
    const u = await call('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, email_confirm: true,
        user_metadata: { app: 'offshore_insights', username } }),
    });
    try {
      await rest_('app_user', { method: 'POST', body: JSON.stringify({
        user_id: u.id, username, display_name: opt.display ?? null,
        email: opt.email ?? null, cell: opt.cell ?? null }) });
    } catch (e) {
      await call(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
      throw e;
    }
    console.log(`created ${username} (login email ${email})`);
    deliver(password);
    break;
  }
  case 'reset': {
    const a = await appUser(username) || die(`no user ${username}`);
    const password = newPassword();
    await call(`/auth/v1/admin/users/${a.user_id}`, { method: 'PUT', body: JSON.stringify({ password }) });
    console.log(`reset password for ${username}`);
    deliver(password);
    break;
  }
  case 'disable':
  case 'enable': {
    (await appUser(username)) || die(`no user ${username}`);
    await rest_(`app_user?username=eq.${encodeURIComponent(username)}`, {
      method: 'PATCH', body: JSON.stringify({ disabled: cmd === 'disable' }) });
    console.log(`${cmd}d ${username}`);
    break;
  }
  default:
    die('commands: list | link | create | reset | disable | enable  (see header)');
}
