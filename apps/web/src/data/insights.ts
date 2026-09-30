// Pure data extraction for every dashboard tile (PLAN.md §9). No React, no fetching:
// each function takes the dashboard() payload and returns exactly what a tile draws.
// Rules: unknown (no row) → null, never 0; a 0 rate is a real "no such tax".
import type { Dashboard, Flag, Jurisdiction, Rate, TreatyStatus } from './types';

/** Preferred display order (the design's), then anything else alphabetically. */
const ORDER = ['FR', 'DE', 'BE', 'GB', 'IT', 'ES', 'ZA', 'PT', 'CH'];
export const DEFAULT_SELECTION = ['FR', 'DE', 'BE', 'GB', 'ES', 'ZA'];
const byOrder = (a: string, b: string) => {
  const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
};

export const HUBS = ['MU', 'SC'];
export const HOME = 'ZA';

/** Target countries: kind = country, not an offshore hub. */
export function countries(d: Dashboard): Jurisdiction[] {
  return d.jurisdictions.filter((j) => j.kind === 'country' && !j.is_offshore_hub).sort((a, b) => byOrder(a.code, b.code));
}
export const nameOf = (d: Dashboard, code: string) => d.jurisdictions.find((j) => j.code === code)?.name ?? code;
export const rateOf = (d: Dashboard, code: string, taxType: string): Rate | undefined =>
  d.rates.find((r) => r.jurisdiction_code === code && r.tax_type_code === taxType);
export const taxLabel = (d: Dashboard, code: string) => d.tax_types.find((t) => t.code === code)?.label ?? code;

export const TREATY_LABEL: Record<TreatyStatus, string> = {
  in_force: 'In force', signed_not_in_force: 'Signed, not in force', negotiating: 'Negotiating', none: 'None', unknown: 'Unknown',
};
const TREATY_SCORE: Record<TreatyStatus, number> = { in_force: 1, signed_not_in_force: 0.75, negotiating: 0.5, none: 0, unknown: 0 };

// ── Tile 6: columns · compare countries for one tax type ─────────────────────
export interface CompareItem { code: string; name: string; value: number | null; rate?: Rate }
export function compare(d: Dashboard, taxType: string, cc: string[]): CompareItem[] {
  return cc.map((code) => {
    const rate = rateOf(d, code, taxType);
    return { code, name: nameOf(d, code), value: rate ? rate.headline_rate : null, rate };
  });
}
export function compareStats(items: CompareItem[]) {
  const known = items.filter((i) => i.value != null) as (CompareItem & { value: number })[];
  const sorted = [...known].sort((a, b) => b.value - a.value);
  const avg = known.length ? known.reduce((s, i) => s + i.value, 0) / known.length : null;
  return { highest: sorted[0] ?? null, lowest: sorted[sorted.length - 1] ?? null, avg, unknown: items.length - known.length, sorted };
}
/** Tax types that have at least one known value among target countries (for pickers). */
export function taxTypesWithData(d: Dashboard) {
  const targets = new Set(countries(d).map((c) => c.code));
  return d.tax_types.filter((t) => d.rates.some((r) => r.tax_type_code === t.code && targets.has(r.jurisdiction_code)));
}

// ── Tile 2: top rates ─────────────────────────────────────────────────────────
export const TOP_SEGMENTS = [
  { key: 'INHERITANCE_DIRECT', short: 'Children', title: 'Inheritance · children' },
  { key: 'INHERITANCE_OTHER', short: 'Others', title: 'Inheritance · others' },
  { key: 'CGT_FINANCIAL', short: 'CGT', title: 'CGT · shares' },
] as const;
export function topRates(d: Dashboard, taxType: string, n = 5): Rate[] {
  const targets = new Set(countries(d).map((c) => c.code));
  return d.rates.filter((r) => r.tax_type_code === taxType && targets.has(r.jurisdiction_code))
    .sort((a, b) => b.headline_rate - a.headline_rate || byOrder(a.jurisdiction_code, b.jurisdiction_code)).slice(0, n);
}

// ── Tile 3: market signal radar ───────────────────────────────────────────────
export interface RadarAxis { key: string; label: string; v01: number; known: boolean; display: string }
export function radar(d: Dashboard, code: string, hub = 'MU') {
  const sig = d.signals.find((s) => s.jurisdiction_code === code);
  const all = d.signals;
  const useHnwi = all.some((s) => s.hnwi_count != null);
  const wealthOf = (s: typeof all[number]) => (useHnwi ? s.hnwi_count : s.business_owners);
  const max = (f: (s: typeof all[number]) => number | null) => Math.max(0, ...all.map((s) => f(s) ?? 0));
  const cgtOf = (c: string) => rateOf(d, c, 'CGT_FINANCIAL')?.headline_rate ?? null;
  const maxCgt = Math.max(0, ...all.map((s) => cgtOf(s.jurisdiction_code) ?? 0));
  const ratio = (v: number | null, m: number) => (v == null || m <= 0 ? 0 : Math.min(1, v / m));
  const status: TreatyStatus = (hub === 'SC' ? sig?.treaty_sc : sig?.treaty_mu) ?? 'unknown';
  const wealth = sig ? wealthOf(sig) : null;
  const cgt = cgtOf(code);
  const fmtN = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(v));
  const axes: RadarAxis[] = [
    { key: 'treaty', label: 'Treaty', v01: TREATY_SCORE[status], known: status !== 'unknown', display: TREATY_LABEL[status] },
    { key: 'wealth', label: 'Wealth', v01: ratio(wealth, max(wealthOf)), known: wealth != null,
      display: wealth == null ? 'Unknown' : `${fmtN(wealth)} ${useHnwi ? 'HNWIs' : 'employers'}` },
    { key: 'inheritance', label: 'Inheritance', v01: ratio(sig?.top_inheritance_rate ?? null, max((s) => s.top_inheritance_rate)),
      known: sig?.top_inheritance_rate != null, display: sig?.top_inheritance_rate != null ? pct(sig.top_inheritance_rate) : 'Unknown' },
    { key: 'recurring', label: 'Recurring tax', v01: ratio(sig?.recurring_taxes ?? null, max((s) => s.recurring_taxes)),
      known: (sig?.known_rates ?? 0) > 0, display: (sig?.known_rates ?? 0) > 0 ? `${sig?.recurring_taxes ?? 0} annual taxes` : 'Unknown' },
    { key: 'cgt', label: 'CGT', v01: ratio(cgt, maxCgt), known: cgt != null, display: cgt != null ? pct(cgt) : 'Unknown' },
  ];
  return { axes, wealthMetric: useHnwi ? 'HNWIs (Capgemini)' : 'Employers (Eurostat, proxy until HNWI data)' };
}

// ── Tile 4: coverage map ──────────────────────────────────────────────────────
export interface FeedItem { date: string; title: string; src: string; tag: string; href: string | null }
export interface InsightRow { k: string; v: string; s: string; n?: number }
export interface Pin {
  code: string; name: string; lon: number; lat: number; role: string; knownRates: number; glow01: number;
  rows: InsightRow[]; note: string; feed: FeedItem[];
}
const flagTag: Record<Flag['reason'], string> = { due: 'Re-check', page_changed: 'Source changed', fetch_failed: 'Fetch failed' };
function flagsFor(d: Dashboard, code: string) {
  const rateIds = new Set(d.rate_history.filter((h) => h.jurisdiction_code === code).map((h) => h.id));
  const treatyIds = new Set(d.treaties.filter((t) => t.country_b === code || t.country_a === code).map((t) => t.id));
  return d.flags.filter((f) => (f.target_table === 'tax_rate' && rateIds.has(f.target_id)) || (f.target_table === 'treaty' && treatyIds.has(f.target_id)));
}
export function mapPins(d: Dashboard): Pin[] {
  const js = d.jurisdictions.filter((j) => j.kind === 'country' && j.lon != null && j.lat != null);
  const known = (c: string) => d.rates.filter((r) => r.jurisdiction_code === c && !r.inherited).length;
  const maxKnown = Math.max(1, ...js.map((j) => known(j.code)));
  return js.sort((a, b) => byOrder(a.code, b.code)).map((j) => {
    const hub = j.is_offshore_hub;
    const role = hub ? 'Offshore hub' : j.code === HOME ? 'Home market' : 'Target market';
    let rows: InsightRow[];
    if (hub) {
      const tr = d.treaties.filter((t) => t.country_a === j.code);
      const neg = tr.filter((t) => t.status === 'negotiating').map((t) => t.country_b);
      rows = [
        { k: 'Treaties in force', v: String(tr.filter((t) => t.status === 'in_force').length), s: 'with tracked countries', n: tr.filter((t) => t.status === 'in_force').length },
        { k: 'Under negotiation', v: String(neg.length), s: neg.join(', '), n: neg.length },
        { k: 'Tracked treaties', v: String(tr.length), s: tr.length ? '' : 'none researched yet', n: tr.length },
        { k: 'Next budget', v: j.next_budget_date ? fmtDate(j.next_budget_date) : 'Unknown', s: '' },
      ];
    } else {
      const t = d.treaties.find((x) => x.country_a === 'MU' && x.country_b === j.code);
      const inh = rateOf(d, j.code, 'INHERITANCE_DIRECT'), cgt = rateOf(d, j.code, 'CGT_FINANCIAL');
      const unverified = d.rates.filter((r) => r.jurisdiction_code === j.code && !r.inherited && r.needs_verification).length;
      rows = [
        { k: 'Treaty with Mauritius', v: t ? TREATY_LABEL[t.status] : 'Unknown', s: t?.in_force_on ? 'since ' + t.in_force_on.slice(0, 4) : '' },
        { k: 'Inheritance · children', v: inh ? pct(inh.headline_rate) : 'Unknown', s: inh ? 'top rate' : '', n: inh?.headline_rate },
        { k: 'CGT · shares & funds', v: cgt ? pct(cgt.headline_rate) : 'Unknown', s: cgt ? 'headline' : '', n: cgt?.headline_rate },
        { k: 'Rates with conflicting sources', v: String(unverified), s: `of ${known(j.code)} known`, n: unverified },
      ];
    }
    const notes = d.notes.filter((n) => n.jurisdiction_code === j.code)
      .sort((a, b) => Number(b.topic === 'warning') - Number(a.topic === 'warning') || a.sort_order - b.sort_order);
    const feed: FeedItem[] = [
      ...notes.map((n) => ({ date: n.verified_on ? fmtDate(n.verified_on) : '—', title: n.text, src: n.source_url ? hostOf(n.source_url) : 'Internal note',
        tag: n.topic.replace(/_/g, ' '), href: n.source_url })),
      ...flagsFor(d, j.code).sort((a, b) => b.raised_on.localeCompare(a.raised_on)).map((f) => ({
        date: fmtDate(f.raised_on), title: f.detail ?? flagTag[f.reason], src: `Review flag · ${f.status.replace('_', ' ')}`, tag: flagTag[f.reason], href: null })),
    ];
    const k = known(j.code);
    const warning = notes.find((n) => n.topic === 'warning' || n.topic === 'sales_angle');
    return { code: j.code, name: j.name, lon: j.lon!, lat: j.lat!, role, knownRates: k, glow01: k / maxKnown, rows,
      note: warning?.text ?? (k ? `${k} rates tracked.` : 'No rates researched yet.'), feed };
  });
}

// ── Tile 1: KPI · data health ────────────────────────────────────────────────
export type Range = '7d' | '30d' | '12m';
export interface KpiSeries { label: string; val: number; values: number[]; labels: string[]; delta: number; note: string }
export function kpis(d: Dashboard, range: Range, now = new Date()) {
  const buckets = bucketEnds(range, now);
  const current = d.rate_history.filter((h) => h.valid_to == null && h.headline_rate != null);
  const tracked = buckets.map((b) => current.filter((h) => new Date(h.valid_from) <= b.end).length);
  const raised = buckets.map((b) => d.flags.filter((f) => { const t = new Date(f.raised_on); return t > b.start && t <= b.end; }).length);
  const open = d.flags.filter((f) => f.status === 'pending' || f.status === 'needs_update').length;
  const note = { '7d': 'this week', '30d': 'this month', '12m': 'this year' }[range];
  return {
    rates: { label: 'Rates tracked', val: current.length, values: tracked, labels: buckets.map((b) => b.label), delta: tracked[tracked.length - 1] - tracked[0], note } as KpiSeries,
    flags: { label: 'Open review flags', val: open, values: raised, labels: buckets.map((b) => b.label), delta: raised.reduce((a, b) => a + b, 0), note: 'raised ' + note } as KpiSeries,
  };
}
function bucketEnds(range: Range, now: Date) {
  const out: { start: Date; end: Date; label: string }[] = [];
  const DAY = 864e5;
  if (range === '7d') for (let i = 7; i >= 0; i--) { const end = new Date(now.getTime() - i * DAY); out.push({ start: new Date(end.getTime() - DAY), end, label: 'SMTWTFS'[end.getDay()] }); }
  if (range === '30d') for (let i = 7; i >= 0; i--) { const end = new Date(now.getTime() - i * 7 * DAY); out.push({ start: new Date(end.getTime() - 7 * DAY), end, label: `${end.getDate()} ${MONTHS[end.getMonth()]}` }); }
  if (range === '12m') for (let i = 11; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1); const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ start, end: i === 0 ? now : end, label: MONTHS[start.getMonth()] });
  }
  return out;
}

// ── Tile 5: line · employers over time / rate history ────────────────────────
export type LineMode = 'employers' | 'CGT_FINANCIAL' | 'INHERITANCE_DIRECT';
export function lineSeries(d: Dashboard, mode: LineMode, cc: string[], now = new Date()) {
  if (mode === 'employers') {
    const rows = d.wealth.filter((w) => w.business_owners != null);
    const years = [...new Set(rows.map((w) => w.year))].sort();
    const series = cc.map((code) => ({ code, values: years.map((y) => rows.find((w) => w.jurisdiction_code === code && w.year === y)?.business_owners ?? null) }))
      .filter((s) => s.values.some((v) => v != null));
    return { years, series, unit: 'count' as const, title: 'Employers · Eurostat', source: 'Eurostat lfsa_egaps' };
  }
  const hist = d.rate_history.filter((h) => h.tax_type_code === mode && h.headline_rate != null);
  const first = Math.min(now.getFullYear() - 5, ...hist.map((h) => +h.valid_from.slice(0, 4)));
  const years = Array.from({ length: now.getFullYear() - first + 1 }, (_, i) => first + i);
  const series = cc.map((code) => ({ code, values: years.map((y) => {
    const row = hist.filter((h) => h.jurisdiction_code === code && h.valid_from <= `${y}-12-31` && (!h.valid_to || h.valid_to > `${y}-01-01`))
      .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
    return row?.headline_rate ?? null;
  }) })).filter((s) => s.values.some((v) => v != null));
  return { years, series, unit: 'pct' as const, title: `${taxLabel(d, mode)} · history`, source: 'tax_rate history' };
}

// ── Tile 7: donut · wealth share ──────────────────────────────────────────────
export type WealthMetric = 'business_owners' | 'hnwi_count' | 'millionaires';
export const WEALTH_LABEL: Record<WealthMetric, string> = { business_owners: 'Employers', hnwi_count: 'HNWIs', millionaires: 'Millionaires' };
export function wealthShare(d: Dashboard, metric: WealthMetric, cc: string[]) {
  const items = cc.map((code) => {
    const row = d.wealth.filter((w) => w.jurisdiction_code === code && w[metric] != null).sort((a, b) => b.year - a.year)[0];
    return { code, name: nameOf(d, code), value: row ? (row[metric] as number) : null, year: row?.year ?? null, source: row?.source ?? null };
  });
  const known = items.filter((i) => i.value != null) as { code: string; name: string; value: number; year: number; source: string }[];
  const total = known.reduce((s, i) => s + i.value, 0);
  return { items: known, missing: items.filter((i) => i.value == null).map((i) => i.code), total, empty: known.length === 0 };
}

// ── Tile 9: stacked · tax load by category ───────────────────────────────────
export const STACK_CATS = [
  { key: 'investment', label: 'Investment' }, { key: 'estate', label: 'Estate' },
  { key: 'wealth', label: 'Wealth' }, { key: 'anti_offshore', label: 'Anti-offshore' },
] as const;
export function taxLoad(d: Dashboard, cc: string[]) {
  return cc.map((code) => {
    const own = d.rates.filter((r) => r.jurisdiction_code === code);
    const parts = STACK_CATS.map((c) => own.filter((r) => r.category === c.key).reduce((s, r) => s + r.headline_rate, 0));
    return { code, name: nameOf(d, code), parts, total: parts.reduce((a, b) => a + b, 0), known: own.length };
  });
}

// ── Tile 8: review activity (repurposed "structures set up") ─────────────────
export function reviewActivity(d: Dashboard, now = new Date()) {
  const months = Array.from({ length: 12 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 11 + i, 1));
  const key = (t: string) => t.slice(0, 7);
  const mk = (m: Date) => `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
  const raised = months.map((m) => d.flags.filter((f) => key(f.raised_on) === mk(m)).length);
  const confirmed = months.map((m) => d.flags.filter((f) => f.reviewed_on && key(f.reviewed_on) === mk(m) && (f.status === 'confirmed' || f.status === 'resolved')).length);
  return { labels: months.map((m) => MONTHS[m.getMonth()]), raised, confirmed };
}

// ── Tile 10: compounding ─────────────────────────────────────────────────────
export const STRUCTURE_COST = 0.005; // assumption until Justus supplies real costs (PLAN.md §8)
const PORTFOLIO_WEALTH_TAXES = ['WEALTH_NET', 'WEALTH_SOLIDARITY', 'SECURITIES_ACCOUNT'];
export function compounding(d: Dashboard, code: string, ret: number, start = 1_000_000) {
  const cgt = rateOf(d, code, 'CGT_FINANCIAL');
  const applies = (r: Rate) => r.threshold_amount == null || r.threshold_amount < start;
  const wealth = PORTFOLIO_WEALTH_TAXES.map((t) => rateOf(d, code, t)).filter((r): r is Rate => !!r && r.headline_rate > 0 && applies(r));
  const anti = [rateOf(d, code, 'FOREIGN_ASSET_TAX')].filter((r): r is Rate => !!r && r.headline_rate > 0);
  const entry = (r: Rate) => (r.rate_min ?? r.headline_rate) / 100;
  const homeDrag = ret * (cgt ? cgt.headline_rate / 100 : 0) + wealth.reduce((s, r) => s + entry(r), 0);
  const structDrag = STRUCTURE_COST + anti.reduce((s, r) => s + entry(r), 0);
  const at = (drag: number, t: number) => start * Math.pow(1 + ret - drag, t);
  const assumptions = [
    cgt ? `CGT ${pct(cgt.headline_rate)} on the ${Math.round(ret * 100)}% return, as if realised every year` : 'CGT unknown: treated as 0 (understates the home drag)',
    ...wealth.map((r) => `${r.label}: ${pct((r.rate_min ?? r.headline_rate))} entry band${r.threshold_note ? ` (${r.threshold_note})` : ''}`),
    `Structure cost ${(STRUCTURE_COST * 100).toFixed(1)}%/yr (assumption)`,
    ...anti.map((r) => `${r.label}: ${pct(entry(r) * 100)}/yr on assets held abroad`),
  ];
  return { homeDrag, structDrag, at, start, assumptions, cgtKnown: !!cgt };
}

// ── Shared formatting ─────────────────────────────────────────────────────────
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const pct = (v: number) => (Math.round(v * 10) / 10).toString() + '%';
export const fmtDate = (iso: string) => { const t = new Date(iso); return `${String(t.getDate()).padStart(2, '0')} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`; };
export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
export const fmtCount = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v)));
