import { describe, expect, it } from 'vitest';
import type { Dashboard } from './types';
import { latestYear, rateForYear, refDateOf, treatyForYear, wealthForYear, yearsWithData } from './years';

const J = (code: string, extra = {}) => ({ code, name: code, parent_code: null, kind: 'country', currency: 'EUR', tax_year_start: '01-01',
  next_budget_date: null, is_offshore_hub: false, notes: null, lon: 0, lat: 0, regional_tax_types: [], ...extra });
const H = (j: string, t: string, rate: number, from: string, to: string | null = null) => ({ id: Math.random(), jurisdiction_code: j, tax_type_code: t,
  headline_rate: rate, valid_from: from, valid_to: to, verified_on: from, needs_verification: false });
const W = (j: string, year: number, extra = {}) => ({ id: Math.random(), jurisdiction_code: j, year, millionaires: null, uhnwi_count: null,
  business_owners: null, source: 'S', source_url: null, verified_on: '2026-09-30', ...extra });

const d = {
  jurisdictions: [J('GB', { tax_year_start: '04-06' }), J('BE', { regional_tax_types: ['INH'] }), J('BE-VLG', { kind: 'region', parent_code: 'BE' }),
    J('FR'), J('MU', { is_offshore_hub: true, tax_year_start: '07-01' })],
  rate_history: [
    H('FR', 'CGT', 30, '2024-01-01', '2025-01-01'), H('FR', 'CGT', 31.4, '2025-01-01', '2026-01-01'), H('FR', 'CGT', 31.4, '2026-01-01'),
    H('GB', 'CGT', 20, '2023-04-06', '2025-04-06'), H('GB', 'CGT', 24, '2025-04-06'),
    H('BE', 'CGT', 10, '2024-01-01'), H('BE', 'INH', 99, '2024-01-01'),            // BE national INH exists but is set per region
    H('BE-VLG', 'INH', 27, '2025-01-01'),
    H('FR', 'WEALTH', 1.5, '2024-06-01', '2025-06-01'), H('FR', 'WEALTH', 1.7, '2025-06-01', '2026-01-01'),   // 1.5 in force on 1 Jan 2025, replaced on 1 Jun
  ],
  treaties: [{ country_a: 'MU', country_b: 'FR', status: 'in_force', signed_on: '1980-01-01', in_force_on: '1982-09-17' },
    { country_a: 'MU', country_b: 'GB', status: 'in_force', signed_on: null, in_force_on: null },
    { country_a: 'MU', country_b: 'ES', status: 'signed_not_in_force', signed_on: '2025-07-01', in_force_on: null }],
  wealth: [W('FR', 2025, { millionaires: 2388000 }), W('FR', 2024, { millionaires: 2300000 }), W('GB', 2025, { millionaires: 2428000 }),
    W('FR', 2025, { business_owners: 1400000, source: 'E' })],
} as unknown as Dashboard;

describe('rateForYear: the rate in force on the first day of the country\'s own tax year', () => {
  it('picks each year\'s row', () => {
    expect(rateForYear(d, 'FR', 'CGT', 2024)?.row.headline_rate).toBe(30);
    expect(rateForYear(d, 'FR', 'CGT', 2025)?.row.headline_rate).toBe(31.4);
    expect(rateForYear(d, 'FR', 'CGT', 2026)?.row.headline_rate).toBe(31.4);
    expect(rateForYear(d, 'FR', 'CGT', 2023)).toBeUndefined();   // unknown, not 0
  });
  it('a UK "2025" is the year starting 6 April 2025, so the change made that day applies', () => {
    expect(rateForYear(d, 'GB', 'CGT', 2025)?.row.headline_rate).toBe(24);
    expect(rateForYear(d, 'GB', 'CGT', 2024)?.row.headline_rate).toBe(20);
  });
  it('flags a rate that changed during the year; the figure is the rate at the start', () => {
    expect(rateForYear(d, 'FR', 'WEALTH', 2025)).toMatchObject({ row: { headline_rate: 1.5 }, changedDuringYear: true });
    expect(rateForYear(d, 'FR', 'CGT', 2025)?.changedDuringYear).toBe(false);
    expect(rateForYear(d, 'FR', 'WEALTH', 2024)).toBeUndefined();   // the first row only starts on 1 Jun 2024
  });
  it('a region inherits its country\'s rate, except for the taxes its country sets per region', () => {
    expect(rateForYear(d, 'BE-VLG', 'CGT', 2025)).toMatchObject({ inherited: true, row: { headline_rate: 10 } });
    expect(rateForYear(d, 'BE-VLG', 'INH', 2025)).toMatchObject({ inherited: false, row: { headline_rate: 27 } });
    expect(rateForYear(d, 'BE-VLG', 'INH', 2024)).toBeUndefined();   // never the national 99
  });
});

describe('wealth belongs to the tax year containing its "as at" date', () => {
  it('year-end counts land in the calendar year; a UK year-end count lands in the tax year that contains 31 Dec', () => {
    expect(wealthForYear(d, 'FR', 'millionaires', 2025)?.value).toBe(2388000);
    expect(wealthForYear(d, 'FR', 'millionaires', 2024)?.value).toBe(2300000);
    expect(wealthForYear(d, 'GB', 'millionaires', 2025)?.value).toBe(2428000);   // 31 Dec 2025 is in 2025/26
    expect(wealthForYear(d, 'GB', 'millionaires', 2024)).toBeNull();
  });
  it('averages are mid-year; rows from before ref_date fall back to year end / mid-year', () => {
    expect(refDateOf(W('FR', 2025, { business_owners: 1 }) as never)).toBe('2025-06-30');
    expect(refDateOf(W('FR', 2025, { millionaires: 1 }) as never)).toBe('2025-12-31');
    expect(refDateOf(W('FR', 2025, { millionaires: 1, ref_date: '2025-10-01' }) as never)).toBe('2025-10-01');
  });
});

describe('treaty status by year comes from the dates', () => {
  it('in force from the in-force date, signed before that, none before signing', () => {
    expect(treatyForYear(d, 'MU', 'FR', 1990)).toMatchObject({ status: 'in_force', known: true });
    expect(treatyForYear(d, 'MU', 'FR', 1981)).toMatchObject({ status: 'signed_not_in_force', known: true });
    expect(treatyForYear(d, 'MU', 'FR', 1970)).toMatchObject({ status: 'none', known: true });
  });
  it('without dates, an earlier year cannot be proven', () => {
    expect(treatyForYear(d, 'MU', 'GB', 2020)).toMatchObject({ status: 'in_force', known: false });
    expect(treatyForYear(d, 'MU', 'XX', 2020)).toBeNull();
  });
  it('signed in July 2025: signed for 2025, not in force', () => {
    expect(treatyForYear(d, 'MU', 'ES', 2025)).toMatchObject({ status: 'signed_not_in_force', known: true });
  });
});

describe('years that have data', () => {
  it('lists each tax year a row was in force, not just the year it started', () => {
    expect(yearsWithData(d, ['FR'], '2026-10-02')).toEqual([2024, 2025, 2026]);
    expect(yearsWithData(d, ['GB'], '2026-10-02')).toEqual([2023, 2024, 2025, 2026]);   // 2023/24 row [6 Apr 2023, 6 Apr 2025), then 2025/26 onward
  });
  it('any combination of countries: the union', () => {
    expect(yearsWithData(d, ['BE'], '2026-10-02')).toEqual([2024, 2025, 2026]);
    expect(latestYear(d, ['FR', 'GB'], '2026-10-02')).toBe(2026);
    expect(latestYear(d, ['XX'], '2026-10-02')).toBeNull();
  });
});
