// "Latest version wins" (research/README.md): a re-published value replaces the stored one, but never silently. These pure functions list what a run
// would CHANGE among values already stored, as "RESTATED old → new" with both sources, so Hentus sees every restatement before anything is applied.
// A new value where nothing is stored is not a restatement. A current rate that changes is a new tax year (history mode closes the old row), not a restatement either:
// only closed back-year rows, which describe a year that is over, and closed-year index returns can be restated.
const near = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 1e-9);

/** Index returns in the run whose stored value for the same index, year, basis and currency differs. */
export function restatedReturns(run, stored = []) {
  const out = [];
  for (const r of run.returns ?? []) {
    for (const [year, pct] of Object.entries(r.values ?? {})) {
      const old = (stored ?? []).find((s) => s.index_code === r.index_code && s.year === +year && s.basis === r.basis && s.currency === r.currency);
      if (old && !near(old.total_return_pct, pct)) {
        out.push({ kind: 'return', what: `${r.index_code} ${year} ${r.basis} ${r.currency}`, diffs: [`${Number(old.total_return_pct)} → ${pct}`], oldSource: old.source, newSource: r.source_by_year?.[year] ?? r.source });
      }
    }
  }
  return out;
}

/** Closed back-year rate rows in the run whose stored row (same jurisdiction, tax and start date) has other numbers. */
export function restatedRates(run, history = []) {
  const out = [];
  for (const x of run.rates ?? []) {
    if (!x.to) continue;
    const old = (history ?? []).find((s) => s.jurisdiction_code === x.j && s.tax_type_code === x.t && s.valid_from === x.from);
    if (!old) continue;
    const diffs = [];
    if (!near(old.headline_rate, x.h)) diffs.push(`rate ${old.headline_rate} → ${x.h}`);
    if (!near(old.rate_min, x.min ?? x.h)) diffs.push(`minimum ${old.rate_min} → ${x.min ?? x.h}`);
    if (!near(old.rate_max, x.max ?? x.h)) diffs.push(`maximum ${old.rate_max} → ${x.max ?? x.h}`);
    if (!near(old.threshold_amount, x.thr ?? null)) diffs.push(`threshold ${old.threshold_amount ?? 'none'} → ${x.thr ?? 'none'}`);
    if (diffs.length) out.push({ kind: 'rate', what: `${x.j} ${x.t} ${x.from} to ${x.to}`, diffs, oldSource: old.source_url ?? null, newSource: x.source_override ?? null });
  }
  return out;
}

/** The lines shown to Hentus (and written as comments at the top of the SQL). */
export function formatRestated(items) {
  if (!items.length) return ['No stored value is restated: every value in this run is new or unchanged.'];
  return [`RESTATED (${items.length}): the newest edition replaces a stored value. Show Hentus before applying.`,
    ...items.map((i) => `  ${i.what}: ${i.diffs.join('; ')}   [was: ${i.oldSource ?? 'no source'} | now: ${i.newSource ?? 'run source'}]`)];
}
