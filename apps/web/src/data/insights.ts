// Shared data helpers over the dashboard() payload. Tile-specific extraction is added
// here one tile at a time, as each tile's question, data, axes and legend are agreed
// (PLAN.md §9). Rule for every tile: unknown (no row) → null, never 0.
import type { Dashboard, Jurisdiction, Rate, TaxType, TreatyStatus } from './types';

/** Preferred display order, then anything else alphabetically. */
const ORDER = ['FR', 'DE', 'BE', 'GB', 'IT', 'ES', 'ZA', 'PT', 'CH'];
const byOrder = (a: string, b: string) => {
  const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
};

export const HUBS = ['MU', 'SC'];

/** Countries a client can come from: kind = country, not an offshore hub. */
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

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const pct = (v: number) => (Math.round(v * 10) / 10).toString() + '%';
export const fmtDate = (iso: string) => { const t = new Date(iso); return `${String(t.getDate()).padStart(2, '0')} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`; };
export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
export const fmtCount = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v)));

// ── Global page filters (country slicer + tax-type toggles) ──────────────────
export const CATEGORIES = [
  { key: 'investment', label: 'Investment' }, { key: 'estate', label: 'Estate' }, { key: 'wealth', label: 'Wealth' },
  { key: 'withholding', label: 'Withholding' }, { key: 'income', label: 'Income' }, { key: 'anti_offshore', label: 'Anti-offshore' },
] as const;
export type AppliesTo = 'all' | 'individual' | 'trust' | 'company';
export function filterTaxTypes(d: Dashboard, cats: string[], appliesTo: AppliesTo): TaxType[] {
  const catIdx = (c: string) => CATEGORIES.findIndex((x) => x.key === c);
  // Grouped by category (so category headers line up), then by the tax type's own order.
  return d.tax_types.filter((t) => cats.includes(t.category) && (appliesTo === 'all' || t.applies_to.includes(appliesTo)))
    .sort((a, b) => catIdx(a.category) - catIdx(b.category) || a.sort_order - b.sort_order);
}
/** Short column labels for tax types (full label stays in tooltips). */
export const SHORT: Record<string, string> = {
  CGT_FINANCIAL: 'CGT shares', CGT_PROPERTY: 'CGT property', INCOME_TOP: 'Income top', WHT_DIVIDEND: 'WHT dividends',
  WHT_INTEREST: 'WHT interest', INHERITANCE_DIRECT: 'Inheritance children', INHERITANCE_OTHER: 'Inheritance others',
  WEALTH_NET: 'Net wealth', WEALTH_SOLIDARITY: 'Solidarity wealth', WEALTH_PROPERTY: 'Property wealth',
  SECURITIES_ACCOUNT: 'Securities account', FOREIGN_ASSET_TAX: 'Foreign assets', FOREIGN_PROPERTY: 'Foreign property',
};
export const shortLabel = (t: TaxType) => SHORT[t.code] ?? t.label;

// ── G4 · Tax heatmap: countries × tax types, intensity = headline_rate ───────
export interface HeatCell { rate: Rate | null }   // null = unknown (grey), never 0
export function heatmap(d: Dashboard, cc: string[], types: TaxType[]) {
  const rows = cc.map((code) => ({ code, name: nameOf(d, code), cells: types.map((t) => ({ rate: rateOf(d, code, t.code) ?? null }) as HeatCell) }));
  const known = rows.flatMap((r) => r.cells).filter((c) => c.rate).map((c) => c.rate!.headline_rate);
  return { rows, cols: types, max: known.length ? Math.max(...known) : 0, known: known.length, total: rows.length * types.length };
}
