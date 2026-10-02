// Shared by the research scripts: read the same dashboard() payload the page uses (service role, from .env),
// so the list of countries, currencies and ISO codes lives in the database, not in each script.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const readEnv = () => Object.fromEntries(readFileSync(join(here, '..', '.env'), 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));

export async function loadDashboard() {
  const env = readEnv();
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/dashboard`, { method: 'POST', body: '{}', headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json',
    'Content-Profile': env.SUPABASE_SCHEMA, 'Accept-Profile': env.SUPABASE_SCHEMA } });
  if (!res.ok) throw new Error(`dashboard() failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Target countries (kind = country, not a hub), from the database; `--countries FR,DE` overrides. */
export async function targetCountries(argv = process.argv) {
  const i = argv.indexOf('--countries');
  const d = await loadDashboard();
  const all = d.jurisdictions.filter((j) => j.kind === 'country' && !j.is_offshore_hub);
  // An explicit --countries list may name a country that is not in the database yet (the pilot of a new country):
  // it gets a minimal row, so its figures can be fetched and written into the same run.
  if (i < 0) return { d, countries: all };
  const want = argv[i + 1].split(',');
  return { d, countries: want.map((code) => all.find((j) => j.code === code) ?? ({ code, name: code, kind: 'country', is_offshore_hub: false })) };
}
