import { describe, expect, it } from 'vitest';
import type { Dashboard, Rate } from './types';
import {
  compare, compareStats, compounding, countries, kpis, lineSeries, mapPins, radar, reviewActivity, taxLoad, topRates, wealthShare,
} from './insights';

const J = (code: string, name: string, extra: Partial<Dashboard['jurisdictions'][number]> = {}) => ({
  code, name, parent_code: null, kind: 'country' as const, currency: 'EUR', tax_year_start: '01-01', next_budget_date: null,
  is_offshore_hub: false, notes: null, lon: 0, lat: 0, ...extra,
});
let rid = 0;
const R = (j: string, tt: string, v: number, extra: Partial<Rate> = {}): Rate => ({
  jurisdiction_code: j, name: j, parent_code: null, tax_type_code: tt, label: tt, category: 'investment', applies_to: [],
  is_recurring: false, sort_order: 10, headline_rate: v, rate_min: null, rate_max: null, threshold_amount: null, threshold_note: null,
  note: null, source_url: null, verified_on: '2026-09-30', next_check_on: '2026-12-31', needs_verification: false, inherited: false,
  tax_rate_id: ++rid, ...extra,
});

function fixture(): Dashboard {
  const rates = [
    R('FR', 'CGT_FINANCIAL', 31.4), R('FR', 'INHERITANCE_DIRECT', 45, { category: 'estate' }), R('FR', 'WEALTH_NET', 0, { category: 'wealth', is_recurring: true }),
    R('DE', 'CGT_FINANCIAL', 26.375),
    R('ES', 'CGT_FINANCIAL', 30), R('ES', 'WEALTH_NET', 3.5, { category: 'wealth', is_recurring: true, rate_min: 0.2, threshold_amount: 700000 }),
    R('ES', 'WEALTH_SOLIDARITY', 3.5, { category: 'wealth', is_recurring: true, rate_min: 1.7, threshold_amount: 3000000 }),
    R('ES-MD', 'CGT_FINANCIAL', 30, { parent_code: 'ES', inherited: true }),
    R('IT', 'CGT_FINANCIAL', 26), R('IT', 'FOREIGN_ASSET_TAX', 0.4, { category: 'anti_offshore', is_recurring: true, rate_min: 0.2 }),
  ];
  return {
    generated_at: '2026-09-30T10:00:00Z', me: { username: 't', display_name: 'T' },
    jurisdictions: [J('FR', 'France'), J('DE', 'Germany'), J('ES', 'Spain'), J('IT', 'Italy'), J('PT', 'Portugal'),
      J('ES-MD', 'Madrid', { kind: 'region', parent_code: 'ES' }), J('MU', 'Mauritius', { is_offshore_hub: true, next_budget_date: '2027-06-15' })],
    tax_types: [], rates,
    rate_history: rates.filter((r) => !r.inherited).map((r) => ({ id: r.tax_rate_id, jurisdiction_code: r.jurisdiction_code, tax_type_code: r.tax_type_code,
      headline_rate: r.headline_rate, valid_from: '2026-01-01', valid_to: null, verified_on: '2026-09-30', needs_verification: false })),
    treaties: [{ id: 1, country_a: 'MU', country_b: 'FR', status: 'in_force', signed_on: null, in_force_on: '1982-09-17', mli_note: null, source_url: null, verified_on: '2026-09-30', next_check_on: '2027-03-31' },
      { id: 2, country_a: 'MU', country_b: 'ES', status: 'negotiating', signed_on: null, in_force_on: null, mli_note: null, source_url: null, verified_on: '2026-09-30', next_check_on: '2027-03-31' }],
    wealth: [
      { id: 1, jurisdiction_code: 'FR', year: 2024, millionaires: null, hnwi_count: null, uhnwi_count: null, business_owners: 1375300, source: 'E', source_url: null, verified_on: '2026-09-30' },
      { id: 2, jurisdiction_code: 'FR', year: 2025, millionaires: null, hnwi_count: null, uhnwi_count: null, business_owners: 1383100, source: 'E', source_url: null, verified_on: '2026-09-30' },
      { id: 3, jurisdiction_code: 'DE', year: 2025, millionaires: null, hnwi_count: null, uhnwi_count: null, business_owners: 1715200, source: 'E', source_url: null, verified_on: '2026-09-30' },
    ],
    notes: [{ id: 1, jurisdiction_code: 'ES', topic: 'sales_angle', text: 'angle', source_url: null, verified_on: null, sort_order: 20 },
      { id: 2, jurisdiction_code: 'ES', topic: 'warning', text: 'No DTA', source_url: 'https://www.mra.mu/x', verified_on: null, sort_order: 10 }],
    signals: [
      { jurisdiction_code: 'FR', name: 'France', treaty_mu: 'in_force', treaty_sc: 'unknown', wealth_year: null, millionaires: null, hnwi_count: null, uhnwi_count: null,
        business_owners: 1383100, recurring_taxes: 0, top_inheritance_rate: 45, top_wealth_rate: 0, anti_offshore_taxes: 0, known_rates: 3, unverified_rates: 0 },
      { jurisdiction_code: 'PT', name: 'Portugal', treaty_mu: 'negotiating', treaty_sc: 'unknown', wealth_year: null, millionaires: null, hnwi_count: null, uhnwi_count: null,
        business_owners: null, recurring_taxes: null, top_inheritance_rate: null, top_wealth_rate: null, anti_offshore_taxes: null, known_rates: 0, unverified_rates: 0 },
      { jurisdiction_code: 'DE', name: 'Germany', treaty_mu: 'unknown', treaty_sc: 'unknown', wealth_year: null, millionaires: null, hnwi_count: null, uhnwi_count: null,
        business_owners: 1715200, recurring_taxes: 0, top_inheritance_rate: null, top_wealth_rate: null, anti_offshore_taxes: 0, known_rates: 1, unverified_rates: 0 },
    ],
    flags: [
      { id: 9, target_table: 'tax_rate', target_id: rates[0].tax_rate_id, reason: 'page_changed', status: 'pending', detail: 'changed', raised_on: '2026-09-29T06:00:00Z', reviewed_on: null },
      { id: 10, target_table: 'treaty', target_id: 1, reason: 'due', status: 'confirmed', detail: null, raised_on: '2026-08-10T06:00:00Z', reviewed_on: '2026-08-11T06:00:00Z' },
    ],
    runs: [],
  };
}
const NOW = new Date('2026-09-30T12:00:00Z');

describe('countries', () => {
  it('lists target countries only: no regions, no hubs', () => {
    expect(countries(fixture()).map((c) => c.code)).toEqual(['FR', 'DE', 'IT', 'ES', 'PT']);
  });
});

describe('compare (tile 6)', () => {
  it('keeps unknown as null and a real 0 as 0', () => {
    const items = compare(fixture(), 'WEALTH_NET', ['FR', 'ES', 'PT']);
    expect(items.map((i) => i.value)).toEqual([0, 3.5, null]);
    const s = compareStats(items);
    expect(s.unknown).toBe(1);
    expect(s.highest?.code).toBe('ES');
    expect(s.lowest?.code).toBe('FR');
    expect(s.avg).toBe(1.75);
  });
});

describe('topRates (tile 2)', () => {
  it('sorts descending and excludes inherited regions', () => {
    const top = topRates(fixture(), 'CGT_FINANCIAL');
    expect(top.map((r) => r.jurisdiction_code)).toEqual(['FR', 'ES', 'DE', 'IT']);
  });
});

describe('radar (tile 3)', () => {
  it('marks unknown axes as unknown at 0 and uses employers as the wealth proxy', () => {
    const pt = radar(fixture(), 'PT');
    expect(pt.axes.find((a) => a.key === 'treaty')).toMatchObject({ v01: 0.5, known: true });
    expect(pt.axes.find((a) => a.key === 'wealth')).toMatchObject({ v01: 0, known: false, display: 'Unknown' });
    const de = radar(fixture(), 'DE');
    expect(de.axes.find((a) => a.key === 'treaty')).toMatchObject({ v01: 0, known: false });
    expect(de.axes.find((a) => a.key === 'wealth')?.v01).toBe(1);
    expect(de.wealthMetric).toMatch(/Employers/);
  });
});

describe('mapPins (tile 4)', () => {
  it('gives hubs the hub role and puts warnings first in the feed, then flags', () => {
    const pins = mapPins(fixture());
    expect(pins.find((p) => p.code === 'MU')?.role).toBe('Offshore hub');
    const es = pins.find((p) => p.code === 'ES')!;
    expect(es.feed[0].title).toBe('No DTA');
    const fr = pins.find((p) => p.code === 'FR')!;
    expect(fr.feed.map((f) => f.tag)).toEqual(['Source changed', 'Re-check']);
    expect(fr.glow01).toBe(1); // FR and ES tie on known rates (3 each)
  });
});

describe('kpis (tile 1)', () => {
  it('counts tracked rates and flags raised in the window', () => {
    const k = kpis(fixture(), '7d', NOW);
    expect(k.rates.val).toBe(9);
    expect(k.flags.val).toBe(1);
    expect(k.flags.values.reduce((a, b) => a + b, 0)).toBe(1);
    expect(kpis(fixture(), '12m', NOW).flags.delta).toBe(2);
  });
});

describe('lineSeries (tile 5)', () => {
  it('employers: years with data, missing values null', () => {
    const l = lineSeries(fixture(), 'employers', ['FR', 'DE', 'PT'], NOW);
    expect(l.years).toEqual([2024, 2025]);
    expect(l.series.find((s) => s.code === 'DE')?.values).toEqual([null, 1715200]);
    expect(l.series.some((s) => s.code === 'PT')).toBe(false);
  });
  it('rate history: null before valid_from', () => {
    const l = lineSeries(fixture(), 'CGT_FINANCIAL', ['FR'], NOW);
    expect(l.years[0]).toBe(2021);
    expect(l.series[0].values.slice(-2)).toEqual([null, 31.4]);
  });
});

describe('wealthShare (tile 7)', () => {
  it('is empty (not zero) for a metric with no data', () => {
    expect(wealthShare(fixture(), 'hnwi_count', ['FR', 'DE']).empty).toBe(true);
    const e = wealthShare(fixture(), 'business_owners', ['FR', 'DE', 'PT']);
    expect(e.total).toBe(1383100 + 1715200);
    expect(e.missing).toEqual(['PT']);
  });
});

describe('taxLoad (tile 9)', () => {
  it('sums known headline rates per category', () => {
    const [es] = taxLoad(fixture(), ['ES']);
    expect(es.parts).toEqual([30, 0, 7, 0]);
  });
});

describe('reviewActivity (tile 8)', () => {
  it('buckets raised and confirmed per month', () => {
    const a = reviewActivity(fixture(), NOW);
    expect(a.labels.at(-1)).toBe('Sep');
    expect(a.raised.at(-1)).toBe(1);
    expect(a.raised.at(-2)).toBe(1);
    expect(a.confirmed.at(-2)).toBe(1);
  });
});

describe('compounding (tile 10)', () => {
  it('applies wealth taxes only above their threshold, using the entry band', () => {
    const c = compounding(fixture(), 'ES', 0.06);
    // CGT 30% of 6% + WEALTH_NET entry 0.2% (threshold 700k < 1m); solidarity (3m) excluded
    expect(c.homeDrag).toBeCloseTo(0.06 * 0.3 + 0.002, 10);
    expect(c.structDrag).toBeCloseTo(0.005, 10);
  });
  it('adds anti-offshore taxes to the structure side', () => {
    const c = compounding(fixture(), 'IT', 0.06);
    expect(c.structDrag).toBeCloseTo(0.005 + 0.002, 10);
  });
  it('flags unknown CGT instead of hiding it', () => {
    const c = compounding(fixture(), 'PT', 0.06);
    expect(c.cgtKnown).toBe(false);
    expect(c.assumptions[0]).toMatch(/unknown/i);
  });
});
