// Shared data helpers over the dashboard() payload. Tile-specific extraction is added
// here one tile at a time, as each tile's question, data, axes and legend are agreed
// (PLAN.md §9). Rule for every tile: unknown (no row) → null, never 0.
import type { Dashboard, Jurisdiction, Rate, TreatyStatus } from './types';

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
