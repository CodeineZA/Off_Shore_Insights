// What the world map draws, as plain data: no React, so it can be tested. Rule everywhere: unknown is
// never 0 (a dashed stub, a hatched country), and a figure only counts if its source says it.
import type { Dashboard, Jurisdiction, TreatyStatus } from './types';
import { rateForYear, treatyForYear, wealthForYear, wealthUpToYear } from './years';

// ── Colours (Mauritius and Seychelles each get one; money metrics get theirs, none shared) ──
export const HUB_PAINT = { MU: '#d8b07a', SC: '#4fb3a9' } as const;
export type MoneyKey = 'millionaires' | 'uhnwi_count' | 'business_owners' | 'trusts_count' | 'private_wealth_usd_bn';
export const MONEY: { key: MoneyKey; label: string; short: string; color: string; what: string }[] = [
  { key: 'millionaires', label: 'Millionaires', short: 'Mill.', color: '#ece6dc', what: 'net worth over US$1m (UBS)' },
  { key: 'uhnwi_count', label: 'UHNWI', short: 'UHNW', color: '#e0775f', what: 'ultra-high-net-worth: over US$30m (Knight Frank)' },
  { key: 'business_owners', label: 'Business owners', short: 'Biz', color: '#6fa8dc', what: 'self-employed with employees (Eurostat, ILO)' },
  { key: 'trusts_count', label: 'Trusts', short: 'Trusts', color: '#a3c27a', what: 'registered trusts (national registers)' },
  { key: 'private_wealth_usd_bn', label: 'Private wealth', short: 'Wealth', color: '#9d8cd6', what: 'total private wealth, US$ bn (UBS)' },
];

// ── Treaties ─────────────────────────────────────────────────────────────────
export type Fill = 'mu' | 'sc' | 'both' | 'none' | 'unknown';
export interface Paint { fill: Fill; outlineMu: boolean; outlineSc: boolean }
/** In force → a solid fill in the hub's colour (both → stripes); signed or negotiating → an outline only; none → dark; no data → hatched. */
export function treatyPaint(mu: TreatyStatus | null, sc: TreatyStatus | null): Paint {
  const inForce = (s: TreatyStatus | null) => s === 'in_force';
  const pending = (s: TreatyStatus | null) => s === 'signed_not_in_force' || s === 'negotiating';
  const known = (s: TreatyStatus | null) => s != null && s !== 'unknown';
  const fill: Fill = inForce(mu) && inForce(sc) ? 'both' : inForce(mu) ? 'mu' : inForce(sc) ? 'sc' : known(mu) || known(sc) ? 'none' : 'unknown';
  return { fill, outlineMu: pending(mu), outlineSc: pending(sc) };
}
/** Treaty status of `country` with each hub in the tax year that begins in `year` (null = no treaty row at all). */
export function treatyStatuses(d: Dashboard, country: string, year: number): { MU: TreatyStatus | null; SC: TreatyStatus | null } {
  const at = (hub: string) => treatyForYear(d, hub, country, year);
  return { MU: at('MU')?.status ?? null, SC: at('SC')?.status ?? null };
}

// ── Money bars at the capitals ───────────────────────────────────────────────
export interface Bar { key: MoneyKey; value: number | null; norm: number; year: number | null; source: string | null; /** from an earlier year than the one asked for */ carried: boolean }
export interface CapitalBars { code: string; name: string; capital: string; lon: number; lat: number; bars: Bar[] }
/**
 * One bar per metric at each capital, for the tax year beginning in `year`. Each metric is scaled to its own maximum
 * across the countries drawn, so "who has more of X" reads straight off the map. A metric with no figure is `value: null`.
 * `carry`: where the exact year has no figure, use the newest earlier one and mark it `carried`.
 */
export function capitalBars(d: Dashboard, keys: MoneyKey[], year: number, carry = false): CapitalBars[] {
  const places = d.jurisdictions.filter((j) => j.kind === 'country' && j.capital_lon != null && j.capital_lat != null);
  const raw = places.map((j) => ({ j, vals: keys.map((key) => { const hit = carry ? wealthUpToYear(d, j.code, key, year) : wealthForYear(d, j.code, key, year); return { key, hit, carried: !!(hit && 'carried' in hit && hit.carried) }; }) }));
  const max: Partial<Record<MoneyKey, number>> = {};
  for (const r of raw) for (const v of r.vals) if (v.hit) max[v.key] = Math.max(max[v.key] ?? 0, v.hit.value);
  return raw.map(({ j, vals }) => ({
    code: j.code, name: j.name, capital: j.capital ?? '', lon: j.capital_lon!, lat: j.capital_lat!,
    bars: vals.map(({ key, hit, carried }) => ({ key, value: hit?.value ?? null, norm: hit && max[key] ? hit.value / max[key]! : 0, year: hit?.year ?? null, source: hit?.source ?? null, carried })),
  }));
}

// ── Region bars (when a country is selected) ─────────────────────────────────
export interface RegionBars { code: string; name: string; lon: number | null; lat: number | null; bars: { taxType: string; label: string; rate: number | null }[] }
/** For each region of `country`, the rate of each tax its country sets per region, in the tax year beginning in `year`. */
export function regionBars(d: Dashboard, country: string, year: number): RegionBars[] {
  const c = d.jurisdictions.find((j) => j.code === country);
  const types = (c?.regional_tax_types ?? []).map((t) => d.tax_types.find((x) => x.code === t)).filter((t) => !!t);
  return d.jurisdictions.filter((j) => j.parent_code === country).map((r: Jurisdiction) => ({
    code: r.code, name: r.name, lon: r.lon, lat: r.lat,
    bars: types.map((t) => ({ taxType: t!.code, label: t!.label, rate: rateForYear(d, r.code, t!.code, year)?.row.headline_rate ?? null })),
  }));
}

// ── Where you are on the map: world → country → region, and Back goes up one step ──
export interface Focus { country: string | null; region: string | null }
export const WORLD: Focus = { country: null, region: null };
export const zoomOut = (f: Focus): Focus => (f.region ? { country: f.country, region: null } : WORLD);
/** Selecting a country from the world, or a region within the current country. Anything else is ignored. */
export function zoomTo(d: Dashboard, f: Focus, code: string): Focus {
  const j = d.jurisdictions.find((x) => x.code === code);
  if (!j || j.is_offshore_hub) return f;
  if (j.kind === 'country') return { country: j.code, region: null };
  return j.parent_code === f.country ? { country: f.country, region: j.code } : { country: j.parent_code, region: j.code };
}
/** The entity every panel below the map is about: the region if one is selected, else the country, else nothing. */
export const focusCode = (f: Focus) => f.region ?? f.country;
