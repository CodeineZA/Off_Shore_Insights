// The tax slicer chart: this entity's taxes grouped by market, per selected tax year, with the Mauritius and
// Seychelles rate beside each. Also the focus a click sets, which filters everything else on the page.
// Unknown is never 0: a missing figure is `rate: null`.
import type { Dashboard, TaxCategory, TaxType } from './types';
import { rateForYear } from './years';
import { taxYearFor } from './taxyear';
import { niceMax } from '../ui/geom';

/** Estate and wealth first (what hurts a millionaire most), warnings about going offshore last. */
export const CATEGORY_ORDER: TaxCategory[] = ['estate', 'wealth', 'investment', 'income', 'withholding', 'anti_offshore'];
export const CATEGORY_LABEL: Record<TaxCategory, string> = {
  estate: 'Estate & inheritance', wealth: 'Wealth', investment: 'Investment gains', income: 'Income', withholding: 'Withholding', anti_offshore: 'Against offshore',
};

export interface TaxYearCell { year: number; label: string; rate: number | null; inherited: boolean; changedDuringYear: boolean }
/** For a tax the country sets per region: each region's rate in the latest selected year (the country itself has no single rate). */
export interface RegionalRate { code: string; name: string; rate: number | null }
export interface TaxRow { type: TaxType; years: TaxYearCell[]; hub: { MU: number | null; SC: number | null }; regions?: RegionalRate[] }
export interface TaxGroup { category: TaxCategory; label: string; rows: TaxRow[] }

export function taxBars(d: Dashboard, code: string, years: number[]): TaxGroup[] {
  const ys = [...years].sort((a, b) => a - b);
  const latest = ys[ys.length - 1];
  const rows: TaxRow[] = [];
  for (const type of d.tax_types) {
    const cells: TaxYearCell[] = ys.map((year) => {
      const r = rateForYear(d, code, type.code, year);
      return { year, label: taxYearFor(d, code, year).label, rate: r?.row.headline_rate ?? null, inherited: r?.inherited ?? false, changedDuringYear: r?.changedDuringYear ?? false };
    });
    const hub = { MU: rateForYear(d, 'MU', type.code, latest)?.row.headline_rate ?? null, SC: rateForYear(d, 'SC', type.code, latest)?.row.headline_rate ?? null };
    const here = d.jurisdictions.find((j) => j.code === code);
    const regions = (here?.regional_tax_types ?? []).includes(type.code)
      ? d.jurisdictions.filter((j) => j.parent_code === code).map((j) => ({ code: j.code, name: j.name, rate: rateForYear(d, j.code, type.code, latest)?.row.headline_rate ?? null }))
      : undefined;
    if (cells.some((c) => c.rate != null) || hub.MU != null || hub.SC != null || regions?.some((r) => r.rate != null)) rows.push({ type, years: cells, hub, regions: regions?.length ? regions : undefined });
  }
  return CATEGORY_ORDER.map((category) => ({ category, label: CATEGORY_LABEL[category],
    rows: rows.filter((r) => r.type.category === category).sort((a, b) => a.type.sort_order - b.type.sort_order) })).filter((g) => g.rows.length);
}

/** The chart's right-hand end: the highest rate anywhere on it (every year, every region, both hubs), rounded up. */
export const scaleMax = (groups: TaxGroup[]) =>
  niceMax(Math.max(1, ...groups.flatMap((g) => g.rows.flatMap((r) => [...r.years.map((c) => c.rate ?? 0), ...(r.regions ?? []).map((x) => x.rate ?? 0), r.hub.MU ?? 0, r.hub.SC ?? 0]))));

/** What the slicer is focused on: a whole market (category) or a single tax. null = everything. */
export type TaxFocus = { category: TaxCategory; taxType?: undefined } | { taxType: string; category?: undefined } | null;
export const inFocus = (type: TaxType, f: TaxFocus) => !f || (f.category ? type.category === f.category : type.code === f.taxType);
/** Click semantics: clicking the focused item clears it. */
export const toggleFocus = (cur: TaxFocus, next: NonNullable<TaxFocus>): TaxFocus =>
  (cur && ((cur.category && cur.category === next.category) || (cur.taxType && cur.taxType === next.taxType)) ? null : next);
export function focusLabel(d: Dashboard, f: TaxFocus): string | null {
  if (!f) return null;
  return f.category ? CATEGORY_LABEL[f.category] : d.tax_types.find((t) => t.code === f.taxType)?.label ?? f.taxType;
}
