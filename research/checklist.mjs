// The one checklist: what must exist for a country, a region or a hub before its page is complete.
// Pure functions over the dashboard() payload so they can be tested without a database.
//   buildChecklist(d, today, { recipes }) → [{ jurisdiction_code, item, status, detail, where_to_get }]
// status: have | missing | blocked | stale. "blocked" is sticky: Claude sets it (via a run's gaps[]) once a
// source has been read and does not publish the figure; a later audit keeps it while the figure is absent.
const pad = (n) => String(n).padStart(2, '0');

/** The tax year that begins in `startYear` for a year starting on `startMD` ('01-01', '04-06', '07-01'). */
export function taxYearByStartYear(startMD, startYear) {
  const [m, d] = (startMD || '01-01').split('-').map(Number);
  const start = `${startYear}-${pad(m)}-${pad(d)}`;
  const end = new Date(Date.UTC(startYear + 1, m - 1, d) - 86400000).toISOString().slice(0, 10);
  const calendar = (startMD || '01-01') === '01-01';
  return { startYear, start, end, label: calendar ? String(startYear) : `${startYear}/${String(startYear + 1).slice(2)}` };
}
/** The tax year containing the date `on` (ISO yyyy-mm-dd). */
export function taxYear(startMD, on) {
  const [m, d] = (startMD || '01-01').split('-').map(Number);
  const y = Number(on.slice(0, 4));
  return taxYearByStartYear(startMD, on >= `${y}-${pad(m)}-${pad(d)}` ? y : y - 1);
}

const covers = (r, on) => r.valid_from <= on && (r.valid_to == null || on < r.valid_to);

export function buildChecklist(d, today, { recipes = [] } = {}) {
  const out = [];
  const rUrl = (id) => recipes.find((r) => r.id === id)?.url;
  const cellUrl = (cell) => recipes.find((r) => (r.cells ?? []).includes(cell))?.url;
  const at = (text, url) => (url ? `${text} — ${url}` : text);
  const byCode = Object.fromEntries(d.jurisdictions.map((j) => [j.code, j]));
  const existing = new Map((d.research_items ?? []).map((r) => [`${r.jurisdiction_code}|${r.item}`, r]));
  const hist = d.rate_history ?? [];

  for (const j of d.jurisdictions) {
    const parent = j.parent_code ? byCode[j.parent_code] : null;
    const isRegion = j.kind === 'region', isHub = !!j.is_offshore_hub;
    const items = [];
    const add = (item, status, detail, where_to_get) => items.push({ jurisdiction_code: j.code, item, status, detail: detail ?? null, where_to_get: where_to_get ?? null });
    const ty = taxYear(j.tax_year_start ?? parent?.tax_year_start, today);
    const nameFor = j.name;

    // ── structure (countries only) ──
    if (!isRegion && !isHub) {
      if (j.structure_checked_on) add('structure', 'have', j.structure_note ?? 'One national regime');
      else add('structure', 'missing', 'Not yet checked which taxes are set below national level', `Run /research-country ${nameFor} (structure check)`);
    }

    // ── taxes: the country/hub owns all of them; a region only the taxes its country sets per region ──
    const regional = new Set(parent?.regional_tax_types ?? []);
    const ownCodes = isRegion ? d.tax_types.filter((t) => regional.has(t.code)) : d.tax_types;
    const known = [];
    for (const t of ownCodes) {
      const cur = hist.find((r) => r.jurisdiction_code === j.code && r.tax_type_code === t.code && r.valid_to == null);
      const sets = (j.regional_tax_types ?? []).includes(t.code);
      if (!cur) {
        if (sets) add(`tax:${t.code}`, 'have', 'Set by the regions: see each region', null);
        else add(`tax:${t.code}`, 'missing', `No ${t.label.toLowerCase()} rate`, at(`National tax authority, or PwC Worldwide Tax Summaries for ${nameFor}`, cellUrl(`${j.code}:${t.code}`)));
        continue;
      }
      known.push(t.code);
      if (cur.verified_on < ty.start) add(`tax:${t.code}`, 'stale', `Not confirmed for tax year ${ty.label} (began ${ty.start})`, `Re-run the recipe for ${t.code} (/update-offshore-insights ${j.code})`);
      else add(`tax:${t.code}`, 'have', cur.needs_verification ? 'Conflicting or secondary source: check' : null, null);
    }
    // Back years: does each of the two tax years before the current one have a figure for every tax we hold?
    if (known.length) {
      for (const k of [2, 1]) {
        const y = taxYearByStartYear(j.tax_year_start ?? parent?.tax_year_start, ty.startYear - k);
        const have = known.filter((c) => hist.some((r) => r.jurisdiction_code === j.code && r.tax_type_code === c && covers(r, y.start))).length;
        if (have === known.length) add(`history:${y.startYear}`, 'have', `${have} of ${known.length} taxes have a ${y.label} figure`, null);
        else add(`history:${y.startYear}`, 'missing', `${have} of ${known.length} taxes have a ${y.label} figure`, `Back-year run for ${nameFor}: dated snapshot or official source for ${y.label}`);
      }
    }

    // ── treaty, gates, money, firms, map shapes (countries only) ──
    if (!isRegion && !isHub) {
      for (const hub of ['MU', 'SC']) {
        const t = d.treaties.find((x) => x.country_a === hub && x.country_b === j.code);
        if (!t || t.status === 'unknown') add(`treaty:${hub}`, 'missing', t ? 'Status unknown' : 'No treaty row', at(`Official ${hub === 'MU' ? 'Mauritius Revenue Authority' : 'Seychelles Revenue Commission'} treaty list`, rUrl(hub === 'MU' ? 'mra-MU-dta' : 'src-SC-dta')));
        else add(`treaty:${hub}`, 'have', t.status, null);
        if (t && (t.status === 'in_force' || t.status === 'signed_not_in_force')) {
          const need = t.status === 'in_force' ? t.in_force_on : t.signed_on;
          if (!need) add(`treaty_dates:${hub}`, 'missing', `${t.status === 'in_force' ? 'In-force' : 'Signed'} date to confirm`, at('The treaty text or the revenue authority list', rUrl(hub === 'MU' ? 'mra-MU-dta' : 'src-SC-dta')));
          else add(`treaty_dates:${hub}`, 'have', need, null);
        }
      }
      for (const hub of ['MU', 'SC']) {
        const g = d.gates.find((x) => x.jurisdiction_code === j.code && x.gate === 'blacklist' && x.hub === hub);
        add(`gate:blacklist:${hub}`, g ? 'have' : 'missing', g ? g.label : 'Not on file', g ? null : `The tax-haven / non-cooperative list ${nameFor} applies, checked for ${hub === 'MU' ? 'Mauritius' : 'Seychelles'}`);
      }
      const tr = d.gates.find((x) => x.jurisdiction_code === j.code && x.gate === 'trust_recognition' && x.hub == null);
      add('gate:trust_recognition', tr ? 'have' : 'missing', tr ? tr.label : 'Not on file', tr ? null : at('HCCH Trusts Convention status table', rUrl('hcch-trusts')));
      const w = d.wealth.filter((x) => x.jurisdiction_code === j.code);
      const col = (c, label, where) => add(`wealth:${c}`, w.some((x) => x[c] != null) ? 'have' : 'missing',
        w.some((x) => x[c] != null) ? `${label}: ${Math.max(...w.filter((x) => x[c] != null).map((x) => x.year))}` : `No ${label} figure`, w.some((x) => x[c] != null) ? null : where);
      col('millionaires', 'Millionaires (net worth ≥US$1m)', at('UBS Global Wealth Report, Millionaire Index table (markets not listed are not published)', rUrl('ubs-gwr-millionaires')));
      col('uhnwi_count', 'UHNWI (≥US$30m)', at('Knight Frank Wealth Report, Databank (markets under 500 UHNWIs are not listed)', rUrl('knightfrank-uhnwi')));
      col('business_owners', 'Business owners', at('Eurostat lfsa_egaps, or ILO for non-EU countries', rUrl('eurostat-employers')));
      col('trusts_count', 'Trusts', 'National trust register or Ministry of Justice statistics (few countries publish a count)');
      // Back years of the two money series: which report edition would supply a missing year (UBS dates a count at the end of the
      // year it covers and publishes it the next year; Knight Frank's databank estimates its own year).
      const refOf = (x) => x.ref_date ?? (x.business_owners != null ? `${x.year}-06-30` : `${x.year}-12-31`);
      for (const k of [2, 1]) {
        const y = taxYearByStartYear(j.tax_year_start ?? parent?.tax_year_start, ty.startYear - k);
        const inYear = w.filter((x) => refOf(x) >= y.start && refOf(x) <= y.end);
        const miss = [];
        if (!inYear.some((x) => x.millionaires != null)) miss.push(`millionaires: UBS Global Wealth Report ${y.startYear + 1} (count at end ${y.startYear})`);
        if (!inYear.some((x) => x.uhnwi_count != null)) miss.push(`UHNWI: Knight Frank Wealth Report ${y.startYear}, Databank`);
        if (!miss.length) add(`history_wealth:${y.startYear}`, 'have', `millionaires and UHNWI for ${y.label}`, null);
        else add(`history_wealth:${y.startYear}`, 'missing', `No ${miss.map((m) => m.split(':')[0]).join(' or ')} figure for ${y.label}`, `Save into PDFs/ and tell Claude: ${miss.map((m) => m.slice(m.indexOf(':') + 2)).join('; ')}`);
      }
      const firms = (d.advisors ?? []).filter((a) => a.country_code === j.code).length;
      add('advisors', firms ? 'have' : 'missing', firms ? `${firms} firms` : 'No firms yet', firms ? null : `Run /find-advisors ${nameFor}`);
    }
    if (isRegion) {
      const any = d.wealth.some((x) => x.jurisdiction_code === j.code);
      add('wealth:regional', any ? 'have' : 'missing', any ? null : 'No regional money figures; the page shows the country-wide figures', any ? null : `The regional statistics office for ${nameFor}`);
    }

    // sticky "blocked": a figure Claude already looked for and the source does not publish stays blocked
    for (const it of items) {
      const prev = existing.get(`${it.jurisdiction_code}|${it.item}`);
      if (prev?.status === 'blocked' && it.status === 'missing') { it.status = 'blocked'; it.detail = prev.detail ?? it.detail; it.where_to_get = prev.where_to_get ?? it.where_to_get; }
    }
    out.push(...items);
  }
  return out;
}

/** SQL that makes research_item match the checklist for the audited jurisdictions (rows no longer on the list are removed). */
export function checklistSql(items, today, codes) {
  const q = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
  const lines = ['set search_path = offshore_insights;'];
  for (const it of items) {
    lines.push(`insert into research_item (jurisdiction_code, item, status, detail, where_to_get, checked_on) values (${q(it.jurisdiction_code)}, ${q(it.item)}, ${q(it.status)}, ${q(it.detail)}, ${q(it.where_to_get)}, ${q(today)})`
      + ` on conflict (jurisdiction_code, item) do update set status = excluded.status, detail = excluded.detail, where_to_get = excluded.where_to_get, checked_on = excluded.checked_on;`);
  }
  for (const c of codes) {
    const keep = items.filter((i) => i.jurisdiction_code === c).map((i) => q(i.item));
    lines.push(`delete from research_item where jurisdiction_code = ${q(c)}${keep.length ? ` and item <> all (array[${keep.join(', ')}])` : ''};`);
  }
  lines.push('reset search_path;', '');
  return lines.join('\n');
}
