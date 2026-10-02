// Year-aware lookups. A selected "year" is a tax-year START year (see taxyear.ts), mapped per country to
// that country's own tax year. Rule for every lookup: no figure for that year → undefined/null, never 0.
import type { Dashboard, RateHistory, TreatyStatus, Wealth } from './types';
import { taxYearFor, taxYearOf } from './taxyear';

const addDays = (iso: string, n: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);
const covers = (r: { valid_from: string; valid_to: string | null }, on: string) => r.valid_from <= on && (r.valid_to == null || on < r.valid_to);
export const todayIso = () => new Date().toISOString().slice(0, 10);

export interface YearRate {
  row: RateHistory;
  /** Taken from the country because the region does not set this tax itself. */
  inherited: boolean;
  /** A different rate began later in the same tax year, so this is the rate at the START of the year. */
  changedDuringYear: boolean;
}
/**
 * The rate in force on `on`. A region uses its own row, else its country's, except for the taxes its
 * country sets per region (the same rule as the v_current_rates view; a test pins the two together).
 */
export function rateOnDate(d: Dashboard, code: string, taxType: string, on: string): { row: RateHistory; inherited: boolean } | undefined {
  const j = d.jurisdictions.find((x) => x.code === code);
  if (!j) return undefined;
  const rows = (c: string) => d.rate_history.filter((r) => r.jurisdiction_code === c && r.tax_type_code === taxType && r.headline_rate != null);
  const own = rows(code).find((r) => covers(r, on));
  const parent = j.parent_code ? d.jurisdictions.find((x) => x.code === j.parent_code) : undefined;
  const setPerRegion = (parent?.regional_tax_types ?? []).includes(taxType);
  const found = own ?? (parent && !setPerRegion ? rows(parent.code).find((r) => covers(r, on)) : undefined);
  return found ? { row: found, inherited: found.jurisdiction_code !== code } : undefined;
}
/** The rate in force on the first day of `code`'s tax year that begins in `startYear`. */
export function rateForYear(d: Dashboard, code: string, taxType: string, startYear: number): YearRate | undefined {
  const ty = taxYearFor(d, code, startYear);
  const hit = rateOnDate(d, code, taxType, ty.start);
  if (!hit) return undefined;
  const later = d.rate_history.some((r) => r.jurisdiction_code === hit.row.jurisdiction_code && r.tax_type_code === taxType && r.valid_from > ty.start && r.valid_from <= ty.end);
  return { ...hit, changedDuringYear: later };
}

/** Wealth rows' "as at" date. Rows from before the ref_date column: year end for counts, mid-year for averages. */
export const refDateOf = (w: Wealth): string => w.ref_date ?? (w.business_owners != null ? `${w.year}-06-30` : `${w.year}-12-31`);

/** Newest figure for a metric whose "as at" date falls inside `code`'s tax year that begins in `startYear`. */
export type WealthKey = 'millionaires' | 'uhnwi_count' | 'business_owners' | 'trusts_count' | 'private_wealth_usd_bn';
export function wealthForYear(d: Dashboard, code: string, metric: WealthKey, startYear: number) {
  const ty = taxYearFor(d, code, startYear);
  const rows = d.wealth.filter((w) => w.jurisdiction_code === code && w[metric] != null && refDateOf(w) >= ty.start && refDateOf(w) <= ty.end)
    .sort((a, b) => refDateOf(b).localeCompare(refDateOf(a)));
  const w = rows[0];
  return w ? { value: w[metric] as number, year: w.year, refDate: refDateOf(w), source: w.source, sourceUrl: w.source_url, verifiedOn: w.verified_on } : null;
}

/** Like wealthForYear, but the newest figure "as at" on or before the end of that tax year (a map reads better with last year's count than with a hole). */
export function wealthUpToYear(d: Dashboard, code: string, metric: WealthKey, startYear: number) {
  const exact = wealthForYear(d, code, metric, startYear);
  if (exact) return { ...exact, carried: false };
  const end = taxYearFor(d, code, startYear).end;
  const w = d.wealth.filter((x) => x.jurisdiction_code === code && x[metric] != null && refDateOf(x) <= end).sort((a, b) => refDateOf(b).localeCompare(refDateOf(a)))[0];
  return w ? { value: w[metric] as number, year: w.year, refDate: refDateOf(w), source: w.source, sourceUrl: w.source_url, verifiedOn: w.verified_on, carried: true } : null;
}

export interface TreatyAtYear { status: TreatyStatus; /** false = today's status, which the dates cannot confirm for that year. */ known: boolean; since: string | null }
/**
 * Treaty status as at the END of the tax year, from the signed / in-force dates. Where the dates are not
 * stored the status cannot be proven for an earlier year: it is returned as `known: false`.
 */
export function treatyForYear(d: Dashboard, hub: string, country: string, startYear: number): TreatyAtYear | null {
  const t = d.treaties.find((x) => x.country_a === hub && x.country_b === country);
  if (!t) return null;
  const end = taxYearFor(d, country, startYear).end;
  if ((t.status === 'in_force' || t.status === 'signed_not_in_force') && (t.in_force_on || t.signed_on)) {
    if (t.in_force_on && t.in_force_on <= end) return { status: 'in_force', known: true, since: t.in_force_on };
    if (t.signed_on && t.signed_on <= end) return { status: 'signed_not_in_force', known: true, since: t.signed_on };
    if (t.in_force_on || t.signed_on) return { status: 'none', known: true, since: null };
  }
  const thisYear = taxYearOf(d, country, todayIso()).startYear;
  return { status: t.status, known: startYear >= thisYear, since: t.in_force_on ?? t.signed_on };
}

/** Tax-year start years for which `codes` hold at least one figure (a rate row in force, or a wealth figure "as at" in it). */
export function yearsWithData(d: Dashboard, codes: string[], today = todayIso()): number[] {
  const years = new Set<number>();
  for (const code of codes) {
    for (const r of d.rate_history) {
      if (r.jurisdiction_code !== code || r.headline_rate == null) continue;
      const first = taxYearOf(d, code, r.valid_from).startYear;
      const last = taxYearOf(d, code, r.valid_to ? addDays(r.valid_to, -1) : today).startYear;
      for (let y = first; y <= Math.max(first, last); y++) years.add(y);
    }
    for (const w of d.wealth) if (w.jurisdiction_code === code && (w.millionaires ?? w.uhnwi_count ?? w.business_owners ?? w.trusts_count) != null) {
      years.add(taxYearOf(d, code, refDateOf(w)).startYear);
    }
  }
  return [...years].sort((a, b) => a - b);
}
/** The most recent year that has data, never beyond today's tax year. */
export const latestYear = (d: Dashboard, codes: string[], today = todayIso()): number | null => {
  const ys = yearsWithData(d, codes, today);
  return ys.length ? ys[ys.length - 1] : null;
};
/** Year chips: click toggles a year; there is always at least one selected (the last one cannot be switched off). */
export const toggleYear = (sel: number[], y: number): number[] =>
  sel.includes(y) ? (sel.length > 1 ? sel.filter((x) => x !== y) : sel) : [...sel, y].sort((a, b) => a - b);
/** The tax-year start years a selection maps to for `code`, as labelled tax years (oldest first). */
export const selectedTaxYears = (d: Dashboard, code: string, years: number[]) => [...years].sort((a, b) => a - b).map((y) => taxYearFor(d, code, y));
