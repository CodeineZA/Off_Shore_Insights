// The client re-implements v_current_rates' region rule so it can draw any year. This pins the two together
// against a saved real payload (apps/web/.fixture.json: gitignored, so present locally and absent on the Pi build,
// where the suite skips). Refresh it with `node scripts/fixture.mjs`.
import { describe, expect, it } from 'vitest';
import type { Dashboard } from './types';
import { rateOnDate, todayIso } from './years';

const found = import.meta.glob('../../.fixture.json', { eager: true, import: 'default' }) as Record<string, Dashboard>;
const d = Object.values(found)[0];

describe.skipIf(!d)('rateOnDate agrees with the SQL view v_current_rates (saved real payload)', () => {
  const today = d?.generated_at ? d.generated_at.slice(0, 10) : todayIso();
  it('every jurisdiction × tax type: same rate, same inherited flag, and unknown stays unknown', () => {
    let compared = 0;
    for (const j of d.jurisdictions) for (const t of d.tax_types) {
      const view = d.rates.find((r) => r.jurisdiction_code === j.code && r.tax_type_code === t.code);   // absent = unknown
      const mine = rateOnDate(d, j.code, t.code, today);
      if (!view) { expect(mine, `${j.code} ${t.code} should be unknown`).toBeUndefined(); continue; }
      expect(mine?.row.headline_rate, `${j.code} ${t.code}`).toBe(Number(view.headline_rate));
      expect(mine?.inherited, `${j.code} ${t.code} inherited`).toBe(view.inherited);
      compared++;
    }
    expect(compared).toBeGreaterThan(100);
  });
});
