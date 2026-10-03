#!/usr/bin/env node
// Recipe "ecb-fx-year-end" (method: api). The report can be shown in EUR, USD or ZAR. MSCI publishes the index in US dollars, so the
// euro and rand returns are DERIVED from it: what an investor holding euros (or rand) would have got by converting to dollars at the
// start of the year, holding the index, and converting back at the end (research/index-currency.mjs). The exchange rates are the
// ECB euro foreign exchange reference rates on the last day published on or before 31 December. Every derived row says so in its
// source text, with the rates and dates used.
//   node research/derive-index-currency.mjs [--with research/runs/<date>-msci-history.json]   → research/runs/<date>-msci-currency.json
//   node research/apply-run.mjs research/runs/<date>-msci-currency.json → db/research/<date>-msci-currency.sql
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDashboard } from './lib.mjs';
import { convertReturn, lastOnOrBefore, parseEcbCsv } from './index-currency.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const today = new Date().toISOString().slice(0, 10);
const ECB = 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD+ZAR.EUR.SP00.A';
const TARGETS = ['EUR', 'ZAR'];

const d = await loadDashboard();
// Run files that are not applied yet can supply US-dollar rows too: --with research/runs/<date>-msci-history.json (repeatable). A run file is the newer edition, so it wins.
const withFiles = process.argv.flatMap((a, i, all) => (a === '--with' ? [all[i + 1]] : []));
const fromRuns = withFiles.flatMap((f) => (JSON.parse(readFileSync(f, 'utf8')).returns ?? [])
  .filter((r) => r.index_code === 'MSCI_WORLD' && r.currency === 'USD' && r.basis === 'gross')
  .flatMap((r) => Object.entries(r.values).map(([year, pct]) => ({ year: +year, total_return_pct: pct, source: r.source }))));
const byYear = new Map((d.market_returns ?? []).filter((r) => r.index_code === 'MSCI_WORLD' && r.currency === 'USD' && r.basis === 'gross').map((r) => [r.year, r]));
for (const r of fromRuns) byYear.set(r.year, r);
const usd = [...byYear.values()].sort((a, b) => a.year - b.year);
if (!usd.length) throw new Error('no MSCI_WORLD gross USD rows in the database or in a --with run file: apply research/runs/2026-10-02-msci.json first');
const first = usd[0].year - 1, last = usd[usd.length - 1].year;

const res = await fetch(`${ECB}?startPeriod=${first}-12-10&endPeriod=${last}-12-31&format=csvdata`, { headers: { Accept: 'text/csv' } });
if (!res.ok) throw new Error(`ECB ${res.status}`);
const obs = parseEcbCsv(await res.text());
if (!obs.USD?.length || !obs.ZAR?.length) throw new Error('ECB returned no USD or ZAR rates');
const at = (date) => {
  const u = lastOnOrBefore(obs.USD, date), z = lastOnOrBefore(obs.ZAR, date);
  if (!u || !z || date.slice(0, 4) !== u.date.slice(0, 4)) throw new Error(`no ECB rate for ${date}`);
  return { date: u.date, rates: { USD: u.value, ZAR: z.value } };
};

const returns = TARGETS.map((ccy) => {
  const values = {}, source_by_year = {};
  for (const r of usd) {
    const a = at(`${r.year - 1}-12-31`), b = at(`${r.year}-12-31`);
    values[r.year] = convertReturn(r.total_return_pct, a.rates, b.rates, ccy);
    const fmt = (x) => `1 EUR = ${x.rates.USD} USD${ccy === 'ZAR' ? `, ${x.rates.ZAR} ZAR` : ''}`;
    source_by_year[r.year] = `DERIVED: MSCI World Index (USD) gross return ${r.total_return_pct}% for ${r.year} (${r.source}), converted to ${ccy} at the ECB euro foreign exchange reference rates of ${a.date} (${fmt(a)}) and ${b.date} (${fmt(b)}). MSCI does not publish this figure.`;
  }
  return { recipe: 'ecb-fx-year-end', index_code: 'MSCI_WORLD', index_name: 'MSCI World Index', basis: 'gross', currency: ccy, source: `MSCI World Index gross return in ${ccy}: derived from the US-dollar return and ECB reference rates`,
    source_url: ECB, verified_on: today, values, source_by_year };
});
const run = { run: today, by: 'claude: node research/derive-index-currency.mjs', mode: 'history',
  note: 'The EUR and ZAR returns of the MSCI World Index, derived from the stored US-dollar gross returns and the ECB year-end reference rates. The report shows them as "includes the currency move".', returns };
const out = join(here, 'runs', `${today}-msci-currency.json`);
writeFileSync(out, JSON.stringify(run, null, 2) + '\n');
for (const r of returns) console.log(r.currency, JSON.stringify(r.values));
console.log(`wrote ${out}\nnext: node research/apply-run.mjs ${out.replace(/\\/g, '/')}`);
