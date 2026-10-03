#!/usr/bin/env node
// Dev only. Lays research runs that have NOT been applied to the live database onto the local, gitignored fixture
// (apps/web/.fixture.json), so a new page can be built and looked at against the real run-file output before anything
// is applied. The fixture then carries `preview_overlay: [...]`, which the Reports page shows as "preview data".
//   node scripts/fixture-overlay.mjs research/runs/2026-10-02-hubs-back.json research/runs/2026-10-02-msci.json [--fx]
// Refresh from the live database (and so drop the overlay) with: node scripts/fixture.mjs
//   --fx   also add the US-dollar exchange rate (as research/fetch-fx.mjs will), from open.er-api.com
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fixturePath = join(root, 'apps', 'web', '.fixture.json');
const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const d = JSON.parse(readFileSync(fixturePath, 'utf8'));
const recipes = Object.fromEntries(JSON.parse(readFileSync(join(root, 'research', 'recipes.json'), 'utf8')).recipes.map((r) => [r.id, r]));
d.preview_overlay = d.preview_overlay ?? [];
let rates = 0, returns = 0;

for (const f of files) {
  const run = JSON.parse(readFileSync(f, 'utf8'));
  for (const x of run.rates ?? []) {
    if (!x.to) throw new Error(`${f}: overlay supports closed back-year rows only (${x.j} ${x.t})`);
    const min = x.min ?? x.h, max = x.max ?? x.h;
    d.rate_history.push({ id: -1 - d.rate_history.length, jurisdiction_code: x.j, tax_type_code: x.t, headline_rate: x.h, rate_min: min, rate_max: max,
      threshold_amount: x.thr ?? null, threshold_note: x.thr_note ?? null, note: x.note ?? null, source_url: x.source_override ?? recipes[x.recipe]?.url ?? null,
      valid_from: x.from, valid_to: x.to, verified_on: x.verified_on ?? run.run, needs_verification: !!x.nv, next_check_on: x.to });
    rates++;
  }
  for (const r of run.returns ?? []) for (const [year, pct] of Object.entries(r.values ?? {})) {
    d.market_returns = d.market_returns ?? [];
    d.market_returns = d.market_returns.filter((m) => !(m.index_code === r.index_code && m.year === +year && m.basis === r.basis && m.currency === r.currency));
    d.market_returns.push({ index_code: r.index_code, index_name: r.index_name, year: +year, total_return_pct: pct, basis: r.basis, currency: r.currency,
      source: r.source, source_url: r.source_url ?? recipes[r.recipe]?.url, verified_on: r.verified_on ?? run.run });
    returns++;
  }
  d.preview_overlay.push(f.replace(/\\/g, '/').split('/').pop());
}
d.rate_history.sort((a, b) => a.valid_from.localeCompare(b.valid_from) || a.id - b.id);

if (args.includes('--fx')) {
  const j = await (await fetch('https://open.er-api.com/v6/latest/EUR')).json();
  if (j.result !== 'success' || !(j.rates?.USD > 0)) throw new Error('FX API failed');
  const asOf = new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10);
  d.fx = d.fx.filter((x) => x.currency !== 'USD');
  d.fx.push({ currency: 'USD', eur_per_unit: 1 / j.rates.USD, as_of: asOf, source_url: 'https://open.er-api.com/v6/latest/EUR' });
}
writeFileSync(fixturePath, JSON.stringify(d));
console.log(`overlay: +${rates} rate rows, +${returns} index returns${args.includes('--fx') ? ', USD rate' : ''}; preview_overlay = ${d.preview_overlay.join(', ')}`);
