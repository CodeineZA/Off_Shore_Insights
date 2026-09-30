#!/usr/bin/env node
// Refresh apps/web/.fixture.json (gitignored) from the live dashboard() payload, signed in as the
// test user through the login gateway, for the dev-only ?fixture mode. No dependencies.
//   node scripts/fixture.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));

const login = await fetch(`${env.SITE_URL}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: env.TEST_USER_USERNAME, password: env.TEST_USER_PASSWORD }) });
if (!login.ok) throw new Error(`login ${login.status}`);
const { access_token } = await login.json();
const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/dashboard`, { method: 'POST', body: '{}',
  headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}`, 'Content-Profile': env.SUPABASE_SCHEMA, 'Content-Type': 'application/json' } });
if (!res.ok) throw new Error(`dashboard ${res.status}`);
const data = await res.json();
writeFileSync(join(root, 'apps/web/.fixture.json'), JSON.stringify(data));
console.log(`fixture: ${data.jurisdictions.length} jurisdictions, ${data.rates.length} rates, ${data.wealth.length} wealth rows`);
