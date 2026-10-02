import { describe, expect, it } from 'vitest';
import type { Dashboard } from './types';
import { WORLD, capitalBars, focusCode, regionBars, treatyPaint, treatyStatuses, zoomOut, zoomTo } from './mapdata';

const J = (code: string, extra = {}) => ({ code, name: code, parent_code: null, kind: 'country', currency: 'EUR', tax_year_start: '01-01', next_budget_date: null,
  is_offshore_hub: false, notes: null, lon: 1, lat: 2, regional_tax_types: [], capital: code + '-city', capital_lon: 3, capital_lat: 4, ...extra });
const W = (j: string, year: number, extra = {}) => ({ id: Math.random(), jurisdiction_code: j, year, millionaires: null, uhnwi_count: null, business_owners: null,
  source: 'S', source_url: null, verified_on: '2026-09-30', ...extra });
const H = (j: string, t: string, rate: number, from: string, to: string | null = null) => ({ id: Math.random(), jurisdiction_code: j, tax_type_code: t,
  headline_rate: rate, valid_from: from, valid_to: to, verified_on: from, needs_verification: false });

const d = {
  jurisdictions: [J('AA'), J('BB'), J('CC', { capital_lon: null, capital_lat: null }), J('MU', { is_offshore_hub: true }),
    J('BE', { regional_tax_types: ['INH'] }), J('BE-V', { kind: 'region', parent_code: 'BE', capital: null, capital_lon: null, capital_lat: null }),
    J('BE-W', { kind: 'region', parent_code: 'BE', capital: null, capital_lon: null, capital_lat: null })],
  tax_types: [{ code: 'INH', label: 'Inheritance' }],
  wealth: [W('AA', 2025, { millionaires: 1000, uhnwi_count: 10 }), W('BB', 2025, { millionaires: 4000 }), W('BB', 2024, { millionaires: 3000, uhnwi_count: 30 })],
  rate_history: [H('BE-V', 'INH', 27, '2024-01-01'), H('BE-W', 'INH', 30, '2025-01-01')],
  treaties: [{ country_a: 'MU', country_b: 'AA', status: 'in_force', signed_on: '1990-01-01', in_force_on: '1991-01-01' },
    { country_a: 'SC', country_b: 'AA', status: 'negotiating', signed_on: null, in_force_on: null },
    { country_a: 'MU', country_b: 'BB', status: 'none', signed_on: null, in_force_on: null }],
} as unknown as Dashboard;

describe('treaty colours: in force is a fill, pending is an outline, no data is hatched', () => {
  it('fill by hub, stripes for both', () => {
    expect(treatyPaint('in_force', 'none').fill).toBe('mu');
    expect(treatyPaint('none', 'in_force').fill).toBe('sc');
    expect(treatyPaint('in_force', 'in_force').fill).toBe('both');
  });
  it('signed and negotiating draw an outline in that hub\'s colour, never a fill', () => {
    expect(treatyPaint('negotiating', 'none')).toEqual({ fill: 'none', outlineMu: true, outlineSc: false });
    expect(treatyPaint('in_force', 'signed_not_in_force')).toEqual({ fill: 'mu', outlineMu: false, outlineSc: true });
  });
  it('no row or unknown is hatched, but "none" is a real answer', () => {
    expect(treatyPaint(null, null).fill).toBe('unknown');
    expect(treatyPaint('unknown', 'unknown').fill).toBe('unknown');
    expect(treatyPaint('none', 'none').fill).toBe('none');
    expect(treatyPaint('none', null).fill).toBe('none');
  });
  it('statuses come from the dates for the year asked', () => {
    expect(treatyStatuses(d, 'AA', 2025)).toEqual({ MU: 'in_force', SC: 'negotiating' });
    expect(treatyStatuses(d, 'AA', 1990)).toEqual({ MU: 'signed_not_in_force', SC: 'negotiating' });
    expect(treatyStatuses(d, 'ZZ', 2025)).toEqual({ MU: null, SC: null });
  });
});

describe('money bars at the capitals', () => {
  it('scales each metric to its own maximum, so who-has-more reads off the map', () => {
    const b = capitalBars(d, ['millionaires', 'uhnwi_count'], 2025);
    const aa = b.find((x) => x.code === 'AA')!, bb = b.find((x) => x.code === 'BB')!;
    expect(aa.bars.find((x) => x.key === 'millionaires')).toMatchObject({ value: 1000, norm: 0.25 });
    expect(bb.bars.find((x) => x.key === 'millionaires')).toMatchObject({ value: 4000, norm: 1 });
    expect(aa.bars.find((x) => x.key === 'uhnwi_count')).toMatchObject({ value: 10, norm: 1 });   // its own scale: UHNWI max is AA's 10
  });
  it('a metric with no figure for that year is null (a dashed stub), never 0', () => {
    const bb = capitalBars(d, ['uhnwi_count'], 2025).find((x) => x.code === 'BB')!;
    expect(bb.bars[0]).toMatchObject({ value: null, norm: 0, year: null });
  });
  it('the year picks the figures: 2024 has BB at 3000 and UHNWI 30', () => {
    const bb = capitalBars(d, ['millionaires', 'uhnwi_count'], 2024).find((x) => x.code === 'BB')!;
    expect(bb.bars.map((x) => x.value)).toEqual([3000, 30]);
  });
  it('carry: with no figure that year, the newest earlier one is used and marked as carried (the map only; the panels stay exact)', () => {
    const strict = capitalBars(d, ['uhnwi_count'], 2025).find((x) => x.code === 'BB')!.bars[0];
    const carried = capitalBars(d, ['uhnwi_count'], 2025, true).find((x) => x.code === 'BB')!.bars[0];
    expect(strict.value).toBeNull();
    expect(carried).toMatchObject({ value: 30, year: 2024, carried: true });
    const exact = capitalBars(d, ['millionaires'], 2025, true).find((x) => x.code === 'BB')!.bars[0];
    expect(exact).toMatchObject({ value: 4000, year: 2025, carried: false });
    expect(capitalBars(d, ['uhnwi_count'], 2023, true).find((x) => x.code === 'BB')!.bars[0].value).toBeNull();   // nothing yet in 2023 or earlier
  });
  it('only countries with a capital position are pinned; hubs and regions follow the same rule', () => {
    const codes = capitalBars(d, ['millionaires'], 2025).map((x) => x.code);
    expect(codes).not.toContain('CC');       // no capital coordinates
    expect(codes).not.toContain('BE-V');     // regions are not countries
    expect(codes).toContain('MU');
  });
});

describe('region bars for a selected country', () => {
  it('one bar per regional tax, per region, for the year; a year with no row is null', () => {
    expect(regionBars(d, 'BE', 2025).map((r) => [r.code, r.bars[0].rate])).toEqual([['BE-V', 27], ['BE-W', 30]]);
    expect(regionBars(d, 'BE', 2024).map((r) => [r.code, r.bars[0].rate])).toEqual([['BE-V', 27], ['BE-W', null]]);
    expect(regionBars(d, 'AA', 2025)).toEqual([]);   // no regions
  });
});

describe('zooming: world → country → region, and Back goes up one step', () => {
  it('walks down and back up', () => {
    let f = zoomTo(d, WORLD, 'BE');
    expect(f).toEqual({ country: 'BE', region: null });
    f = zoomTo(d, f, 'BE-V');
    expect(f).toEqual({ country: 'BE', region: 'BE-V' });
    expect(focusCode(f)).toBe('BE-V');
    f = zoomOut(f);
    expect(f).toEqual({ country: 'BE', region: null });
    expect(focusCode(f)).toBe('BE');
    f = zoomOut(f);
    expect(f).toEqual(WORLD);
    expect(focusCode(f)).toBeNull();
    expect(zoomOut(WORLD)).toEqual(WORLD);   // already at the top
  });
  it('a region picked from elsewhere selects its country as well; hubs and unknown codes do nothing', () => {
    expect(zoomTo(d, WORLD, 'BE-W')).toEqual({ country: 'BE', region: 'BE-W' });
    expect(zoomTo(d, WORLD, 'MU')).toEqual(WORLD);
    expect(zoomTo(d, { country: 'AA', region: null }, 'ZZ')).toEqual({ country: 'AA', region: null });
  });
});
