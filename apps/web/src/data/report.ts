// The "what a million would have become" report: a million (US dollars, euros or rand) put into a global shares index at the start of a year, kept personally
// in the home country, against held through a Trust in Mauritius or Seychelles. One engine feeds the screen, the PDF and the
// Excel, so the three can never disagree. Pure functions over the dashboard() payload.
//
// Rules that never bend (research/README.md): every rate comes from a stored row with its source and date; a missing rate,
// exchange rate or index return is UNKNOWN, never 0, and an incomplete report gives no comparison at all.
import type { Dashboard, MarketReturn } from './types';
import { gateCells } from './model';
import { pct } from './insights';
import { rateForYear } from './years';

export const INDEX = 'MSCI_WORLD';
export const PRINCIPAL = 1_000_000;

/** The currencies a report can be shown in. The index is published in US dollars; the euro and rand returns are derived from it
 *  (research/derive-index-currency.mjs) with the ECB's year-end reference rates, so they include the move of the dollar. */
export const CURRENCIES = ['EUR', 'USD', 'ZAR'] as const;
export type ReportCurrency = (typeof CURRENCIES)[number];
export const CURRENCY_NAME: Record<ReportCurrency, string> = { USD: 'US dollars', EUR: 'euros', ZAR: 'South African rand' };
export const CURRENCY_SYMBOL: Record<ReportCurrency, string> = { USD: 'US$', EUR: '€', ZAR: 'R' };
export const fmtMoney = (v: number, cur: ReportCurrency = 'USD') => `${v < 0 ? '−' : ''}${CURRENCY_SYMBOL[cur]}${Math.round(Math.abs(v)).toLocaleString('en')}`;
/** The old plan's placeholder for the Trust's own yearly cost, until Justus supplies real fees. Always shown beside the result. */
export const DEFAULT_FEE_PCT = 0.5;

export type HubCode = 'MU' | 'SC';
export const HUB_NAME: Record<HubCode, string> = { MU: 'Mauritius', SC: 'Seychelles' };
export const STRUCTURES = { trust: { label: 'Trust', hubs: ['MU', 'SC'] as HubCode[] } };
export type StructureCode = keyof typeof STRUCTURES;

/** The taxes on a share portfolio that the engine models. Inheritance is left out: nobody died in 2024. */
export const MODEL_TAXES = ['CGT_FINANCIAL', 'WEALTH_NET', 'WEALTH_SOLIDARITY', 'SECURITIES_ACCOUNT'] as const;
type ModelTax = (typeof MODEL_TAXES)[number];
const ANTI_OFFSHORE = ['FOREIGN_ASSET_TAX', 'FOREIGN_PROPERTY'];

export interface ReportParams {
  code: string; structure: StructureCode; hub: HubCode;
  startYear: number; endYear?: number; principal: number; feePct: number; index: string;
  /** The currency the report is in (default US dollars): the principal, every amount, and the index return are in it. */
  currency?: ReportCurrency;
}
export type Side = 'home' | 'trust';
export interface RateUsed {
  side: Side; year: number; taxType: string; label: string;
  /** The jurisdiction whose row was used (a region inherits its country's). */
  jurisdiction: string; inherited: boolean;
  /** true = the Trust service relieves this tax, so the hub's rate is used on the trust side. */
  relieved: boolean;
  rate: number; currency: string; thresholdLocal: number | null; /** the allowance in the report's currency */ thresholdConverted: number | null; thresholdNote: string | null; note: string | null;
  sourceUrl: string | null; verifiedOn: string; needsVerification: boolean;
}
export interface SideYear { start: number; gain: number; cgt: number; wealth: number; fee: number; end: number }
export interface YearRow { year: number; returnPct: number; home: SideYear; trust: SideYear }
export interface SideTotals { end: number; tax: number; fee: number }
export interface Flag { level: 'red' | 'amber' | 'green'; text: string; sourceUrl: string | null }
export interface Missing { kind: 'rate' | 'fx' | 'return'; who: string; tax?: string; year?: number; text: string }

export interface ReportOk {
  ok: true; params: ReportParams; currency: ReportCurrency; homeName: string; hubName: string; countryName: string;
  startYear: number; endYear: number; basis: 'gross' | 'net';
  years: YearRow[]; home: SideTotals; trust: SideTotals;
  /** trust end − home end, in the report's currency and as a share of the home result. */
  difference: number; differencePct: number;
  rates: RateUsed[]; returns: MarketReturn[]; flags: Flag[]; toVerify: string[]; assumptions: string[]; summary: string;
}
export interface ReportFail { ok: false; params: ReportParams; reason: 'region' | 'data' | 'params'; text: string; missing: Missing[] }
export type ReportResult = ReportOk | ReportFail;

/** "the Netherlands": a few country names take an article in running text. */
export const the = (name: string) => (/^(Netherlands|United Kingdom|United States|Philippines|Bahamas|Gambia|Czech Republic)$/.test(name) ? `the ${name}` : name);
export const poss = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);
export const fmtUsd = (v: number) => fmtMoney(v, 'USD');
const fail = (params: ReportParams, reason: ReportFail['reason'], text: string, missing: Missing[] = []): ReportFail => ({ ok: false, params, reason, text, missing });

const currencyOf = (d: Dashboard, code: string): string => {
  const j = d.jurisdictions.find((x) => x.code === code);
  return j?.currency ?? d.jurisdictions.find((x) => x.code === j?.parent_code)?.currency ?? 'EUR';
};
/** Units of `to` per 1 unit of `from`, from the stored euro rates; null when either rate is missing. */
export function perUnit(d: Dashboard, from: string, to: string): number | null {
  if (from === to) return 1;
  const a = d.fx.find((x) => x.currency === from), b = d.fx.find((x) => x.currency === to);
  return a && b && b.eur_per_unit > 0 ? a.eur_per_unit / b.eur_per_unit : null;
}
export const usdPer = (d: Dashboard, currency: string) => perUnit(d, currency, 'USD');

interface Rates { CGT_FINANCIAL: { rate: number; thr: number }; WEALTH_NET: { rate: number; thr: number }; WEALTH_SOLIDARITY: { rate: number; thr: number }; SECURITIES_ACCOUNT: { rate: number; thr: number } }

/**
 * One year for one side. Gains are realised every year: capital gains tax on the gain above the yearly exemption, then the
 * wealth taxes on the year-end value (the larger of net-wealth and solidarity tax, plus securities-account tax), then the fee.
 */
export function step(start: number, ret: number, t: Rates, feePct: number): SideYear {
  const gain = start * ret;
  const cgt = Math.max(0, gain - t.CGT_FINANCIAL.thr) * t.CGT_FINANCIAL.rate;
  const v1 = start + gain - cgt;
  const net = Math.max(0, v1 - t.WEALTH_NET.thr) * t.WEALTH_NET.rate;
  const sol = Math.max(0, v1 - t.WEALTH_SOLIDARITY.thr) * t.WEALTH_SOLIDARITY.rate;
  const sec = v1 >= t.SECURITIES_ACCOUNT.thr ? v1 * t.SECURITIES_ACCOUNT.rate : 0;
  const wealth = Math.max(net, sol) + sec;
  const v2 = v1 - wealth;
  const fee = v2 * (feePct / 100);
  return { start, gain, cgt, wealth, fee, end: v2 - fee };
}

export function buildReport(d: Dashboard, p: ReportParams): ReportResult {
  const cur: ReportCurrency = p.currency ?? 'USD';
  const m = (v: number) => fmtMoney(v, cur);
  const j = d.jurisdictions.find((x) => x.code === p.code);
  const hub = d.jurisdictions.find((x) => x.code === p.hub);
  if (!j || j.is_offshore_hub || !hub?.is_offshore_hub) return fail(p, 'params', 'Pick a country or region, and Mauritius or Seychelles.');
  const country = j.kind === 'region' ? d.jurisdictions.find((x) => x.code === j.parent_code)! : j;

  // A tax the country sets per region has no single national rate: the report needs the region.
  const regional = MODEL_TAXES.filter((t) => (country.regional_tax_types ?? []).includes(t));
  if (j.kind === 'country' && regional.length && d.jurisdictions.some((x) => x.parent_code === j.code)) {
    return fail(p, 'region', `${j.name} sets some of these taxes by region. Choose a region.`);
  }

  const relief = new Set(d.service_tax?.filter((s) => s.service_code === p.structure).map((s) => s.tax_type_code) ?? []);
  if (!relief.size) return fail(p, 'params', `No taxes are recorded as relieved by a ${STRUCTURES[p.structure].label.toLowerCase()}.`);

  // Index returns: one basis for the whole run (net when every year has it, else gross), all in the report's currency.
  const all = (d.market_returns ?? []).filter((r) => r.index_code === p.index && r.currency === cur);
  const byBasis = (b: 'gross' | 'net') => new Map(all.filter((r) => r.basis === b).map((r) => [r.year, r]));
  const missing: Missing[] = [];
  const horizon = p.endYear ?? Math.max(p.startYear, ...all.map((r) => r.year));
  // How far a basis runs without a gap from the start year.
  const covered = (m: Map<number, MarketReturn>) => { let y = p.startYear; while (m.has(y) && y <= horizon) y++; return y - 1; };
  const gross = byBasis('gross'), net = byBasis('net');
  const netEnd = covered(net), grossEnd = covered(gross);
  const basis: 'gross' | 'net' = netEnd >= grossEnd && netEnd >= p.startYear ? 'net' : 'gross';
  const endYear = basis === 'net' ? netEnd : grossEnd;
  if (endYear < p.startYear) {
    return fail(p, 'data', `No index return in ${CURRENCY_NAME[cur]} is stored for ${p.startYear}.`, [{ kind: 'return', who: p.index, year: p.startYear, text: `index return in ${cur} for ${p.startYear}` }]);
  }
  const rets = basis === 'net' ? net : gross;
  const yearsList = Array.from({ length: endYear - p.startYear + 1 }, (_, i) => p.startYear + i);

  // Gather every rate both sides need; anything unknown stops the report.
  const rates: RateUsed[] = [];
  const side: Record<Side, Map<number, Rates>> = { home: new Map(), trust: new Map() };
  const homeCurrency = currencyOf(d, p.code), hubCurrency = currencyOf(d, p.hub);
  const need = (who: string, tax: string, year: number, text: string) => missing.push({ kind: 'rate', who, tax, year, text });
  for (const y of yearsList) {
    for (const s of ['home', 'trust'] as Side[]) {
      const row: Partial<Rates> = {};
      for (const t of MODEL_TAXES) {
        const relieved = s === 'trust' && relief.has(t);
        const who = relieved ? p.hub : p.code;
        const hit = rateForYear(d, who, t, y);
        const label = d.tax_types.find((x) => x.code === t)?.label ?? t;
        if (!hit) { need(who, t, y, `${label} for ${d.jurisdictions.find((x) => x.code === who)?.name ?? who}, ${y}`); continue; }
        const rateCur = relieved ? hubCurrency : homeCurrency;
        const thrLocal = hit.row.threshold_amount ?? null;
        const per = perUnit(d, rateCur, cur);
        if (thrLocal != null && per == null) { missing.push({ kind: 'fx', who: rateCur, year: y, text: `exchange rate ${rateCur}→${cur}` }); continue; }
        const thrConv = thrLocal == null ? null : thrLocal * (per as number);
        row[t as ModelTax] = { rate: (hit.row.headline_rate as number) / 100, thr: thrConv ?? 0 };
        rates.push({ side: s, year: y, taxType: t, label, jurisdiction: hit.row.jurisdiction_code, inherited: hit.inherited, relieved,
          rate: hit.row.headline_rate as number, currency: rateCur, thresholdLocal: thrLocal, thresholdConverted: thrConv, thresholdNote: hit.row.threshold_note ?? null,
          note: hit.row.note ?? null, sourceUrl: hit.row.source_url ?? null, verifiedOn: hit.row.verified_on, needsVerification: hit.row.needs_verification });
      }
      side[s].set(y, row as Rates);
    }
  }
  if (missing.length) {
    const seen = new Set<string>(), uniq = missing.filter((m) => { const k = m.text; if (seen.has(k)) return false; seen.add(k); return true; });
    return fail(p, 'data', `Not enough stored data for ${j.name}: ${uniq.length} item${uniq.length === 1 ? '' : 's'} missing.`, uniq);
  }

  // Run both columns.
  const years: YearRow[] = [];
  let hv = p.principal, tv = p.principal;
  for (const y of yearsList) {
    const ret = (rets.get(y)!.total_return_pct) / 100;
    const h = step(hv, ret, side.home.get(y)!, 0), t = step(tv, ret, side.trust.get(y)!, p.feePct);
    years.push({ year: y, returnPct: rets.get(y)!.total_return_pct, home: h, trust: t });
    hv = h.end; tv = t.end;
  }
  const sum = (f: (r: YearRow) => number) => years.reduce((a, r) => a + f(r), 0);
  const home: SideTotals = { end: hv, tax: sum((r) => r.home.cgt + r.home.wealth), fee: 0 };
  const trust: SideTotals = { end: tv, tax: sum((r) => r.trust.cgt + r.trust.wealth), fee: sum((r) => r.trust.fee) };
  const difference = tv - hv;

  // Flags drawn from data we hold (no commentary): the lists, taxes that apply to assets held abroad, the CRS note, rows still to verify.
  const flags: Flag[] = [];
  const level = (s: string): Flag['level'] => (s === 'green' ? 'green' : s === 'red' ? 'red' : 'amber');
  for (const g of gateCells(d, p.code, p.hub)) {
    const what = g.key === 'treaty' ? `Tax treaty with Mauritius` : g.key === 'blacklist' ? `Blacklist, ${HUB_NAME[p.hub]}` : 'Trust recognition';
    flags.push({ level: level(g.status), text: `${what}: ${g.label}`, sourceUrl: g.source });
  }
  for (const t of ANTI_OFFSHORE) {
    const r = rateForYear(d, p.code, t, endYear);
    if (r && (r.row.headline_rate ?? 0) > 0) {
      flags.push({ level: 'red', text: `${d.tax_types.find((x) => x.code === t)?.label ?? t}: ${pct(r.row.headline_rate as number)} in ${the(country.name)}, charged on assets held abroad`, sourceUrl: r.row.source_url ?? null });
    }
  }
  for (const n of d.notes.filter((x) => x.jurisdiction_code === p.hub && x.topic === 'crs')) flags.push({ level: 'amber', text: n.text, sourceUrl: n.source_url });
  const toVerify = [...new Set(rates.filter((r) => r.needsVerification).map((r) => `${r.label} (${d.jurisdictions.find((x) => x.code === r.jurisdiction)?.name ?? r.jurisdiction}, ${r.year})`))];
  if (toVerify.length) flags.push({ level: 'amber', text: `Still to verify: ${toVerify.join('; ')}.`, sourceUrl: null });

  const hubName = HUB_NAME[p.hub], struct = STRUCTURES[p.structure].label.toLowerCase();
  const assumptions = [
    `${m(p.principal)} is invested in the ${all[0]?.index_name ?? 'MSCI World Index'} at the start of ${p.startYear} and left in until the end of ${endYear}; each year earns the index's ${basis} total return in ${CURRENCY_NAME[cur]} (${basis === 'gross' ? 'before dividend withholding tax' : 'after dividend withholding tax'}).${cur === 'USD' ? '' : ` MSCI publishes the index in US dollars, so the ${cur} return is worked out from the dollar return and the ECB's exchange rates at each year end: it includes the move of the dollar against ${cur === 'EUR' ? 'the euro' : 'the rand'}.`}`,
    `Valued in ${CURRENCY_NAME[cur]}, before ${cur === 'USD' ? 'currency moves against your own currency, ' : 'moves of any other currency, '}inflation, dividend and interest taxes, source-country withholding (the same either way), custody and bank fees, and set-up costs.`,
    'Gains are realised every year (capital gains tax is paid yearly, above the yearly exemption). Wealth taxes are charged on the year-end value: the larger of net-wealth and solidarity tax, plus securities-account tax.',
    `Through the ${struct}: the taxes a ${struct} relieves (${MODEL_TAXES.filter((t) => relief.has(t)).map((t) => d.tax_types.find((x) => x.code === t)?.label ?? t).join(', ')}) are charged at ${hubName}'s rates; every other tax stays at ${poss(the(country.name))}. A yearly ${struct} fee of ${p.feePct}% of the value is deducted. Inheritance is not modelled.`,
    `The ${struct} column assumes ${the(country.name)} does not tax the ${struct}'s growth, which is what the structure is designed for; the flags show what we hold on lists, CRS reporting and taxes on assets held abroad.`,
    `Each calendar year uses the tax rates of the tax year that begins in it (${hubName}'s tax year runs ${d.jurisdictions.find((x) => x.code === p.hub)?.tax_year_start === '07-01' ? '1 July to 30 June' : '1 January to 31 December'}). Allowances in local currency are converted at today's stored exchange rate.`,
  ];
  const summary = `If you had put ${m(p.principal)} into global shares at the start of ${p.startYear}, by the end of ${endYear} you would have ${m(hv)} keeping it in ${the(j.name)}, or ${m(tv)} through a ${hubName} ${struct}: ${difference >= 0 ? 'ahead' : 'behind'} by ${m(Math.abs(difference))}.`;
  return {
    ok: true, params: p, currency: cur, homeName: j.name, hubName, countryName: country.name, startYear: p.startYear, endYear, basis,
    years, home, trust, difference, differencePct: hv > 0 ? (difference / hv) * 100 : 0,
    rates, returns: yearsList.map((y) => rets.get(y)!), flags, toVerify, assumptions, summary,
  };
}

/** The start years offered as chips: every year with a stored return, each with the reason it cannot be built yet, if so. */
export function startYears(d: Dashboard, base: Omit<ReportParams, 'startYear'>): { year: number; ok: boolean; reason: string | null }[] {
  const years = [...new Set((d.market_returns ?? []).filter((r) => r.index_code === base.index && r.currency === (base.currency ?? 'USD')).map((r) => r.year))].sort((a, b) => a - b);
  return years.map((year) => { const r = buildReport(d, { ...base, startYear: year }); return { year, ok: r.ok, reason: r.ok ? null : r.text }; });
}
