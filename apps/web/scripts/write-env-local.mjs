// Writes apps/web/.env.local (gitignored) from the repo-root .env: only the values that are
// allowed in the browser bundle (URL, anon key, schema). Never the service role key.
import { readFileSync, writeFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const out = [
  `VITE_SUPABASE_URL=${env.SUPABASE_URL}`,
  `VITE_SUPABASE_ANON_KEY=${env.SUPABASE_ANON_KEY}`,
  `VITE_SUPABASE_SCHEMA=${env.SUPABASE_SCHEMA}`,
].join('\n') + '\n';
writeFileSync(new URL('../.env.local', import.meta.url), out);
console.log('wrote apps/web/.env.local');
