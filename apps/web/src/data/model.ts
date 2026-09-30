// Calculations behind the tiles (PLAN.md §9). Pure functions over the dashboard() payload.
// Every assumption is exported and shown on screen next to the numbers it produces.
import type { Dashboard, Gate, Rate, TreatyStatus } from './types';
import { countries, countryOf, nameOf, rateOf } from './insights';

// ── Currency ─────────────────────────────────────────────────────────────────
export const currencyOf = (d: Dashboard, code: string): string => {
  const j = d.jurisdictions.find((x) => x.code === code);
  return j?.currency ?? d.jurisdictions.find((x) => x.code === j?.parent_code)?.currency ?? 'EUR';
};
/** Amount in the jurisdiction's currency → EUR. null when no FX rate is stored. */
export function toEur(d: Dashboard, code: string, amount: number | null): number | null {
  if (amount == null) return null;
  const c = currencyOf(d, code);
  if (c === 'EUR') return amount;
  const fx = d.fx.find((x) => x.currency === c);
  return fx ? amount * fx.eur_per_unit : null;
}

// ── G5 / C4 · Sample client bill ─────────────────────────────────────────────
export type Basis = 'top' | 'entry';
export interface SampleClient { start: number; ret: number; years: number; heirs: number; basis: Basis }
export const SAMPLE: SampleClient = { start: 2_000_000, ret: 0.06, years: 20, heirs: 2, basis: 'top' };
/** Countries whose death tax is charged on the whole estate, not on each heir's share. */
export const ESTATE_LEVEL = new Set(['GB', 'ZA']);
const PORTFOLIO_WEALTH = [
  { t: 'WEALTH_NET', mode: 'excess' },          // taxed on the value above the allowance
  { t: 'WEALTH_SOLIDARITY', mode: 'excess' },
  { t: 'SECURITIES_ACCOUNT', mode: 'whole' },   // whole value once the threshold is reached
] as const;

export const SAMPLE_ASSUMPTIONS = (c: SampleClient) => [
  `€${(c.start / 1e6).toFixed(0)}m portfolio of shares and funds, ${Math.round(c.ret * 100)}% return a year for ${c.years} years`,
  'Gains realised every year (so capital gains tax is paid yearly, above the annual exemption)',
  'Yearly wealth taxes that hit a portfolio: net wealth or solidarity/large-fortune tax (whichever is higher, as the solidarity tax credits the wealth tax), plus securities-account tax',
  `Then inherited by ${c.heirs} children${c.heirs > 1 ? ' in equal shares' : ''}; UK and South Africa tax the estate as a whole`,
  c.basis === 'top' ? 'Rates: top band (upper bound for progressive taxes)' : 'Rates: entry band (lower bound for progressive taxes)',
  'Local-currency allowances converted to EUR at the stored rate',
];

export interface BillPart { key: 'cgt' | 'wealth' | 'inheritance'; label: string; eur: number; known: boolean; missing: string[] }
export interface Bill { code: string; name: string; parts: BillPart[]; total: number; complete: boolean; finalValue: number; heirsGet: number }

const rv = (r: Rate, basis: Basis) => ((basis === 'entry' ? r.rate_min ?? r.headline_rate : r.headline_rate) ?? 0) / 100;

export function sampleBill(d: Dashboard, code: string, c: SampleClient = SAMPLE): Bill {
  const cgt = rateOf(d, code, 'CGT_FINANCIAL');
  const cgtFree = toEur(d, code, cgt?.threshold_amount ?? 0) ?? 0;
  const wealth = PORTFOLIO_WEALTH.map((w) => ({ ...w, r: rateOf(d, code, w.t) }));
  const inh = rateOf(d, code, 'INHERITANCE_DIRECT');
  const miss = { cgt: cgt ? [] : ['CGT shares'], wealth: wealth.filter((w) => !w.r).map((w) => w.t.replace(/_/g, ' ').toLowerCase()), inh: inh ? [] : ['inheritance (children)'] };

  let v = c.start, cgtPaid = 0, wealthPaid = 0;
  for (let y = 0; y < c.years; y++) {
    const gain = v * c.ret;
    const g = cgt ? Math.max(0, gain - cgtFree) * rv(cgt, c.basis) : 0;
    v += gain - g; cgtPaid += g;
    const due: Record<string, number> = {};
    for (const x of wealth) {
      if (!x.r || !x.r.headline_rate) { due[x.t] = 0; continue; }
      const thr = toEur(d, code, x.r.threshold_amount) ?? 0;
      due[x.t] = x.mode === 'excess' ? Math.max(0, v - thr) * rv(x.r, c.basis) : v >= thr ? v * rv(x.r, c.basis) : 0;
    }
    // A solidarity/large-fortune tax is reduced by the net wealth tax already paid (Spain's
    // ITSGF deducts the regional wealth tax), so the client pays the larger of the two.
    const w = Math.max(due.WEALTH_NET ?? 0, due.WEALTH_SOLIDARITY ?? 0) + (due.SECURITIES_ACCOUNT ?? 0);
    v -= w; wealthPaid += w;
  }
  let inhPaid = 0;
  if (inh && inh.headline_rate) {
    const allowance = toEur(d, code, inh.threshold_amount) ?? 0;
    inhPaid = ESTATE_LEVEL.has(code)
      ? Math.max(0, v - allowance) * rv(inh, c.basis)
      : c.heirs * Math.max(0, v / c.heirs - allowance) * rv(inh, c.basis);
  }
  const parts: BillPart[] = [
    { key: 'cgt', label: 'Capital gains', eur: cgtPaid, known: !miss.cgt.length, missing: miss.cgt },
    { key: 'wealth', label: 'Wealth taxes', eur: wealthPaid, known: !miss.wealth.length, missing: miss.wealth },
    { key: 'inheritance', label: 'Inheritance', eur: inhPaid, known: !miss.inh.length, missing: miss.inh },
  ];
  return { code, name: nameOf(d, code), parts, total: cgtPaid + wealthPaid + inhPaid, complete: parts.every((p) => p.known), finalValue: v, heirsGet: v - inhPaid };
}

// ── Gates (G2, C7, G1 ease of reach) ─────────────────────────────────────────
export type GateKey = 'treaty' | 'blacklist' | 'trust_recognition' | 'marketing';
export type GateStatus = 'green' | 'amber' | 'red' | 'unknown';
export const GATES: { key: GateKey; label: string; hubSpecific: boolean }[] = [
  { key: 'treaty', label: 'Tax treaty', hubSpecific: true },
  { key: 'blacklist', label: 'Blacklist', hubSpecific: true },
  { key: 'trust_recognition', label: 'Trust recognition', hubSpecific: false },
  { key: 'marketing', label: 'Marketing allowed', hubSpecific: false },
];
export interface GateCell { key: GateKey; status: GateStatus; label: string; note: string | null; source: string | null; check: boolean }
const TREATY_GATE: Record<TreatyStatus, { status: GateStatus; label: string }> = {
  in_force: { status: 'green', label: 'In force' }, signed_not_in_force: { status: 'amber', label: 'Signed' },
  negotiating: { status: 'amber', label: 'Negotiating' }, none: { status: 'red', label: 'No treaty' }, unknown: { status: 'unknown', label: 'Unknown' },
};
/** Structures are set up in Mauritius first and moved to Seychelles afterwards (Hentus, 2026-09-30),
 *  so the Mauritius treaty is the one that counts for both hubs. */
export const TREATY_HUB = 'MU';
export function gateCells(d: Dashboard, code: string, hub: string): GateCell[] {
  const country = countryOf(d, code);   // regions share their country's treaty and lists
  return GATES.map((g) => {
    if (g.key === 'treaty') {
      const t = d.treaties.find((x) => x.country_a === TREATY_HUB && x.country_b === country);
      const s = TREATY_GATE[t?.status ?? 'unknown'];
      const since = t?.in_force_on ? ` (in force ${t.in_force_on.slice(0, 4)})` : '';
      const via = hub === TREATY_HUB ? '' : 'Via Mauritius: structures are set up there first, then moved. ';
      return { key: g.key, ...s, note: via + (t ? (t.mli_note ?? s.label) + since : 'No treaty data yet'), source: t?.source_url ?? null, check: false };
    }
    const find = (c: string) => d.gates.find((x) => x.jurisdiction_code === c && x.gate === g.key && (g.hubSpecific ? x.hub === hub : x.hub == null));
    const row: Gate | undefined = find(code) ?? find(country);
    return row ? { key: g.key, status: row.status, label: row.label, note: row.note, source: row.source_url, check: row.needs_verification }
      : { key: g.key, status: 'unknown', label: 'Unknown', note: g.key === 'marketing' ? 'To be decided per country (Justus)' : 'Not researched yet', source: null, check: false };
  });
}
const GATE_SCORE: Record<Exclude<GateStatus, 'unknown'>, number> = { green: 1, amber: 0.5, red: 0 };

// ── Market size (G1, G3, G6, C6) ─────────────────────────────────────────────
export type WealthMetric = 'business_owners' | 'hnwi_count' | 'millionaires' | 'uhnwi_count';
export const WEALTH_LABEL: Record<WealthMetric, string> = { business_owners: 'Business owners', hnwi_count: 'HNWIs', millionaires: 'Millionaires', uhnwi_count: 'UHNWIs' };
export const latestWealth = (d: Dashboard, code: string, m: WealthMetric) => {
  const row = d.wealth.filter((w) => w.jurisdiction_code === code && w[m] != null).sort((a, b) => b.year - a.year)[0];
  return row ? { value: row[m] as number, year: row.year, source: row.source } : null;
};
/** Market size = USD millionaires (UBS: one source covering every country; Hentus, 2026-09-30).
 *  Business owners only while no millionaire figures are stored. */
export const MARKET_METRICS: WealthMetric[] = ['millionaires', 'business_owners'];
export const marketMetric = (d: Dashboard): WealthMetric => MARKET_METRICS.find((m) => d.wealth.some((w) => w[m] != null)) ?? MARKET_METRICS[0];

// ── G1 · Where to go first ───────────────────────────────────────────────────
export interface Segment { v01: number; known: boolean; raw: number | null; note: string }
export interface Opportunity { code: string; name: string; market: Segment; pain: Segment; ease: Segment; score: number; bill: Bill; gates: GateCell[] }
export function opportunities(d: Dashboard, cc: string[], hub: string): Opportunity[] {
  const metric = marketMetric(d);
  const rows = cc.map((code) => {
    const w = latestWealth(d, code, metric);
    const bill = sampleBill(d, code);
    const gates = gateCells(d, code, hub);
    const scored = gates.filter((g) => g.status !== 'unknown');
    const ease = scored.length ? scored.reduce((s, g) => s + GATE_SCORE[g.status as keyof typeof GATE_SCORE], 0) / scored.length : null;
    return { code, name: nameOf(d, code), w, bill, gates, ease, scoredGates: scored.length };
  });
  const maxW = Math.max(0, ...rows.map((r) => r.w?.value ?? 0));
  const maxP = Math.max(0, ...rows.map((r) => r.bill.total));
  return rows.map((r) => {
    const market: Segment = { v01: r.w && maxW ? r.w.value / maxW : 0, known: !!r.w, raw: r.w?.value ?? null,
      note: r.w ? `${Math.round(r.w.value).toLocaleString('en')} ${WEALTH_LABEL[metric].toLowerCase()} (${r.w.year})` : `No ${WEALTH_LABEL[metric].toLowerCase()} figure` };
    const pain: Segment = { v01: maxP ? r.bill.total / maxP : 0, known: r.bill.complete, raw: r.bill.total,
      note: `€${Math.round(r.bill.total / 1000).toLocaleString('en')}k sample-client bill${r.bill.complete ? '' : ' (incomplete: some taxes unknown)'}` };
    const ease: Segment = { v01: r.ease ?? 0, known: r.ease != null, raw: r.ease,
      note: r.ease == null ? 'No gate known' : `${r.scoredGates} of ${GATES.length} gates known` };
    return { code: r.code, name: r.name, market, pain, ease, score: Math.round(((market.v01 + pain.v01 + ease.v01) / 3) * 100), bill: r.bill, gates: r.gates };
  }).sort((a, b) => b.score - a.score);
}

// ── G7 · Rate momentum ───────────────────────────────────────────────────────
export const MOMENTUM_TYPES = ['INCOME_TOP', 'CGT_FINANCIAL', 'INHERITANCE_DIRECT', 'WEALTH_NET'];
export type Direction = 'up' | 'down' | 'flat' | 'unknown';
export function momentum(d: Dashboard, code: string, taxType: string) {
  const src = rateOf(d, code, taxType)?.inherited ? countryOf(d, code) : code;   // a region's national tax moves with the country
  const h = d.rate_history.filter((x) => x.jurisdiction_code === src && x.tax_type_code === taxType && x.headline_rate != null)
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  if (!h.length) return { dir: 'unknown' as Direction, now: null, prev: null, since: null };
  const now = h[h.length - 1], prev = h.length > 1 ? h[h.length - 2] : null;
  const dir: Direction = !prev ? 'flat' : now.headline_rate! > prev.headline_rate! ? 'up' : now.headline_rate! < prev.headline_rate! ? 'down' : 'flat';
  return { dir, now: now.headline_rate, prev: prev?.headline_rate ?? null, since: prev ? now.valid_from : h[0].valid_from };
}

// ── Mode 2 · one country vs the hubs ─────────────────────────────────────────
/** Tax types where the country or a hub has a known value. */
export function compareTypes(d: Dashboard, codes: string[]) {
  return d.tax_types.filter((t) => codes.some((c) => rateOf(d, c, t.code))).sort((a, b) => a.sort_order - b.sort_order);
}
/** Country rate minus hub rate, per tax type where both are known. Positive = the country taxes more. */
export function savingGap(d: Dashboard, code: string, hub: string) {
  return compareTypes(d, [code, hub]).map((t) => {
    const a = rateOf(d, code, t.code), b = rateOf(d, hub, t.code);
    return { t, country: a?.headline_rate ?? null, hub: b?.headline_rate ?? null, gap: a && b ? a.headline_rate - b.headline_rate : null };
  });
}
export const defaultCountry = (d: Dashboard) => (countries(d).some((c) => c.code === 'FR') ? 'FR' : countries(d)[0]?.code ?? '');
