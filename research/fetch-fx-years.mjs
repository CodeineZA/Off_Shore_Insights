#!/usr/bin/env node
// Recipe "ecb-fx-year-end" (method: api): the ECB euro reference rate at the end of every closed calendar year since 2015, for each currency a report can need.
//   node research/fetch-fx-years.mjs   → db/research/fx-years-<date>.sql   (then: bash db/apply.sh <file>, with Hentus's go-ahead)
// A year the ECB has no year-end rate for is reported and stops the run: it is never filled from another year.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDashboard } from './lib.mjs';
import { parseEcbCsv } from './index-currency.mjs';
import { FX_CURRENCIES, fxYearSql, restatedFx, yearEndRates } from './fx-years.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const today = new Date().toISOString().slice(0, 10);
const FIRST = 2015, LAST = Number(today.slice(0, 4)) - 1;                               // closed years only
const years = Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i);

const url = `https://data-api.ecb.europa.eu/service/data/EXR/D.${FX_CURRENCIES.join('+')}.EUR.SP00.A?startPeriod=${FIRST}-12-10&endPeriod=${LAST}-12-31&format=csvdata`;
const res = await fetch(url, { headers: { Accept: 'text/csv' } });
if (!res.ok) throw new Error(`ECB ${res.status}`);
const { rows, missing } = yearEndRates(parseEcbCsv(await res.text()), FX_CURRENCIES, years);
if (missing.length) { console.error('no year-end rate from the ECB for: ' + missing.map((m) => `${m.currency} ${m.year}`).join(', ')); process.exit(1); }

let stored = [];
try { stored = (await loadDashboard()).fx_history ?? []; } catch (e) { console.warn(`restatement check skipped: could not read the database (${e.message})`); }
const changed = restatedFx(rows, stored);
if (changed.length) { console.log(`RESTATED (${changed.length}): the new edition replaces a stored value`); for (const c of changed) console.log(`  ${c.currency} ${c.year}: ${c.old} → ${c.now}  (${c.oldSource} → ${c.newSource})`); }
else console.log(stored.length ? 'No stored year-end rate is restated.' : 'Nothing stored yet: every row is new.');

for (const c of FX_CURRENCIES) console.log(c.padEnd(4), rows.filter((r) => r.currency === c).map((r) => `${r.year}=${r.perEur}`).join(' '));
mkdirSync(join(here, '..', 'db', 'research'), { recursive: true });
const out = join(here, '..', 'db', 'research', `fx-years-${today}.sql`);
writeFileSync(out, fxYearSql(rows, { today }));
console.log(`wrote ${out}: ${rows.length} rows (${FX_CURRENCIES.join(', ')} × ${FIRST} to ${LAST})\nnext: bash db/apply.sh ${out.replace(/\\/g, '/')}`);
