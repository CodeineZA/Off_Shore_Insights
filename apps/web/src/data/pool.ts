// The prospect pool: how many potential clients the country has, by tier, for each tax year chosen.
// Tiers overlap (every UHNWI is also a millionaire) and come from different reports, so they are never added up.
// Unknown is never 0: a tier with no figure is `value: null`. A year with no figure of its own shows the newest earlier
// one, marked `carried` (the same rule as the map's paler bar), so the default view is not a page of blanks.
import type { Dashboard } from './types';
import { MONEY, type MoneyKey } from './mapdata';
import { taxYearFor } from './taxyear';
import { wealthUpToYear } from './years';

/** Order of the tiers, from the widest pool to the narrowest structure. */
export const POOL_KEYS: MoneyKey[] = ['business_owners', 'millionaires', 'uhnwi_count', 'trusts_count'];

export interface PoolCell {
  year: number; label: string;
  value: number | null;
  /** Taken from an earlier tax year because this one has no figure of its own. */
  carried: boolean;
  /** The "as at" year of the figure shown (differs from `year` when carried). */
  asAt: number | null;
  refDate: string | null;
  source: string | null; sourceUrl: string | null; verifiedOn: string | null;
}
export interface PoolRow { key: MoneyKey; label: string; what: string; color: string; cells: PoolCell[]; latest: PoolCell }
export interface Pool {
  /** The code the figures belong to: a region shows its country's. */
  owner: string; inherited: boolean; rows: PoolRow[];
}

export function prospectPool(d: Dashboard, code: string, years: number[]): Pool | null {
  const j = d.jurisdictions.find((x) => x.code === code);
  if (!j || !years.length) return null;
  const owner = j.kind === 'region' && j.parent_code ? j.parent_code : j.code;
  const ys = [...years].sort((a, b) => a - b);
  const rows: PoolRow[] = POOL_KEYS.map((key) => {
    const m = MONEY.find((x) => x.key === key)!;
    const cells: PoolCell[] = ys.map((year) => {
      const w = wealthUpToYear(d, owner, key, year);
      return { year, label: taxYearFor(d, owner, year).label, value: w?.value ?? null, carried: w?.carried ?? false, asAt: w?.year ?? null,
        refDate: w?.refDate ?? null, source: w?.source ?? null, sourceUrl: w?.sourceUrl ?? null, verifiedOn: w?.verifiedOn ?? null };
    });
    return { key, label: m.label, what: m.what, color: m.color, cells, latest: cells[cells.length - 1] };
  });
  return { owner, inherited: owner !== code, rows };
}

/** The widest figure shown: every tier shares one scale, so a narrow tier reads as the sliver it is. */
export const poolMax = (rows: PoolRow[]) => Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.value ?? 0)));
