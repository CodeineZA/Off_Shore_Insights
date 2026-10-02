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

/** The country a jurisdiction belongs to (a region's parent; a country itself). */
export const countryOf = (d: Dashboard, code: string) => d.jurisdictions.find((j) => j.code === code)?.parent_code ?? code;

/**
 * Where a client can come from, as selectable entities (no hubs). A country that sets taxes
 * per region is listed as its regions. Its national entry stays only when it has its own rate for
 * every regional tax (Spain's state rules do); otherwise it is incomplete and left out (Belgium).
 */
export function countries(d: Dashboard): Jurisdiction[] {
  const own = (code: string, t: string) => d.rates.some((r) => r.jurisdiction_code === code && r.tax_type_code === t && !r.inherited);
  const out: Jurisdiction[] = [];
  for (const c of d.jurisdictions.filter((j) => j.kind === 'country' && !j.is_offshore_hub)) {
    const regions = d.jurisdictions.filter((r) => r.parent_code === c.code && !r.is_offshore_hub).sort((a, b) => a.name.localeCompare(b.name));
    if (!regions.length || (c.regional_tax_types ?? []).every((t) => own(c.code, t))) out.push(c);
    out.push(...regions);
  }
  // Regions sit right after their country.
  return out.sort((a, b) => byOrder(a.parent_code ?? a.code, b.parent_code ?? b.code) || (a.parent_code ? 1 : 0) - (b.parent_code ? 1 : 0));
}
/** Display name. A region carries its country code, "Flanders (BE)"; a country listed next to its
 *  regions is its national rules, "Spain (national rules)". */
export const nameOf = (d: Dashboard, code: string) => {
  const j = d.jurisdictions.find((x) => x.code === code);
  if (!j) return code;
  if (j.parent_code) return `${j.name.replace(/\s*\(.*\)\s*$/, '')} (${j.parent_code})`;
  return d.jurisdictions.some((r) => r.parent_code === code) ? `${j.name} (national rules)` : j.name;
};
export const rateOf = (d: Dashboard, code: string, taxType: string): Rate | undefined =>
  d.rates.find((r) => r.jurisdiction_code === code && r.tax_type_code === taxType);
export const taxLabel = (d: Dashboard, code: string) => d.tax_types.find((t) => t.code === code)?.label ?? code;

export const TREATY_LABEL: Record<TreatyStatus, string> = {
  in_force: 'In force', signed_not_in_force: 'Signed, not in force', negotiating: 'Negotiating', none: 'None', unknown: 'Unknown',
};

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const pct = (v: number) => (Math.round(v * 10) / 10).toString() + '%';
export const fmtDate = (iso: string) => { const t = new Date(iso); return `${String(t.getDate()).padStart(2, '0')} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`; };
export const fmtCount = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v)));

/** Short column labels for tax types (full label stays in tooltips). */
export const SHORT: Record<string, string> = {
  CGT_FINANCIAL: 'CGT shares', CGT_PROPERTY: 'CGT property', INCOME_TOP: 'Income top', WHT_DIVIDEND: 'WHT dividends',
  WHT_INTEREST: 'WHT interest', INHERITANCE_DIRECT: 'Inheritance children', INHERITANCE_OTHER: 'Inheritance others',
  WEALTH_NET: 'Net wealth', WEALTH_SOLIDARITY: 'Solidarity wealth', WEALTH_PROPERTY: 'Property wealth',
  SECURITIES_ACCOUNT: 'Securities account', FOREIGN_ASSET_TAX: 'Foreign assets', FOREIGN_PROPERTY: 'Foreign property',
};
export const shortLabel = (t: TaxType) => SHORT[t.code] ?? t.label;
/** One plain sentence per tax type, spelling out any abbreviation (CGT, WHT) in its short label. Shown softly under the label in the expanded tiles. */
export const EXPLAIN: Record<string, string> = {
  CGT_FINANCIAL: 'CGT is capital gains tax: tax on the profit when you sell shares, ETFs or funds.',
  CGT_PROPERTY: 'CGT is capital gains tax: tax on the profit when you sell a property.',
  INCOME_TOP: 'The highest rate of income tax, paid on the top slice of what you earn.',
  WHT_DIVIDEND: 'WHT is withholding tax: tax taken at source from dividends paid to someone abroad.',
  WHT_INTEREST: 'WHT is withholding tax: tax taken at source from interest paid to someone abroad.',
  INHERITANCE_DIRECT: 'Inheritance (estate) tax when assets pass to children or a partner.',
  INHERITANCE_OTHER: 'Inheritance (estate) tax when assets pass to people outside the close family, such as friends or distant relatives.',
  WEALTH_NET: 'A yearly tax on net wealth: everything you own minus what you owe.',
  WEALTH_SOLIDARITY: 'An extra yearly levy on very large fortunes, on top of any wealth tax.',
  WEALTH_PROPERTY: 'A yearly tax on the value of property you own.',
  SECURITIES_ACCOUNT: 'A yearly tax on the value held in a securities (investment) account.',
  FOREIGN_ASSET_TAX: 'A yearly tax on financial assets held abroad. It works against going offshore.',
  FOREIGN_PROPERTY: 'A yearly tax on property held abroad. It works against going offshore.',
};
export const explainOf = (t: TaxType) => EXPLAIN[t.code] ?? t.description ?? '';
