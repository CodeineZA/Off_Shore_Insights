import { describe, expect, it } from 'vitest';
import type { Dashboard, Rate } from './types';
import { gateCells, momentum, opportunities, sampleBill, savingGap, toEur } from './model';

const J = (code: string, currency = 'EUR', extra = {}) => ({ code, name: code, parent_code: null, kind: 'country', currency, tax_year_start: null,
  next_budget_date: null, is_offshore_hub: false, notes: null, lon: 0, lat: 0, ...extra });
const R = (j: string, t: string, h: number, extra: Partial<Rate> = {}) => ({ jurisdiction_code: j, tax_type_code: t, headline_rate: h, rate_min: null,
  rate_max: null, threshold_amount: null, ...extra }) as Rate;
const hist = (j: string, t: string, h: number, from: string, to: string | null) =>
  ({ id: Math.random(), jurisdiction_code: j, tax_type_code: t, headline_rate: h, valid_from: from, valid_to: to, verified_on: from, needs_verification: false });

// Hand-checked example: €1m, 10% return, 1 year, 2 heirs.
const client = { start: 1_000_000, ret: 0.1, years: 1, heirs: 2, basis: 'top' as const };
const d = {
  jurisdictions: [J('XX'), J('GB', 'GBP'), J('YY'), J('MU', 'MUR', { is_offshore_hub: true })],
  fx: [{ currency: 'GBP', eur_per_unit: 1.2, as_of: '2026-09-30', source_url: '' }],
  rates: [
    R('XX', 'CGT_FINANCIAL', 30), R('XX', 'WEALTH_NET', 1, { threshold_amount: 500000 }), R('XX', 'WEALTH_SOLIDARITY', 0), R('XX', 'SECURITIES_ACCOUNT', 0),
    R('XX', 'INHERITANCE_DIRECT', 10, { threshold_amount: 100000 }),
    R('GB', 'CGT_FINANCIAL', 30, { threshold_amount: 3000 }), R('GB', 'INHERITANCE_DIRECT', 10, { threshold_amount: 100000 }),
    R('MU', 'CGT_FINANCIAL', 0),
  ],
  treaties: [{ country_a: 'MU', country_b: 'XX', status: 'in_force', in_force_on: '1982-09-17', mli_note: null, source_url: null },
    { country_a: 'MU', country_b: 'YY', status: 'none', in_force_on: null, mli_note: null, source_url: null }],
  gates: [{ jurisdiction_code: 'XX', hub: 'MU', gate: 'blacklist', status: 'red', label: 'Listed', note: null, source_url: null, needs_verification: false }],
  wealth: [{ jurisdiction_code: 'XX', year: 2025, business_owners: 1000, hnwi_count: null, millionaires: null, uhnwi_count: null, source: 'E' },
    { jurisdiction_code: 'YY', year: 2025, business_owners: 500, hnwi_count: null, millionaires: null, uhnwi_count: null, source: 'E' }],
  rate_history: [hist('XX', 'CGT_FINANCIAL', 25, '2025-01-01', '2026-01-01'), hist('XX', 'CGT_FINANCIAL', 30, '2026-01-01', null), hist('YY', 'CGT_FINANCIAL', 20, '2026-01-01', null)],
  tax_types: [{ code: 'CGT_FINANCIAL', label: 'CGT', sort_order: 10 }, { code: 'INHERITANCE_DIRECT', label: 'Inh', sort_order: 60 }],
} as unknown as Dashboard;

describe('sampleBill', () => {
  it('matches the hand calculation (per-heir inheritance)', () => {
    const b = sampleBill(d, 'XX', client);
    // gain 100,000 → CGT 30,000 → 1,070,000; wealth 1% × 570,000 = 5,700 → 1,064,300;
    // per heir 532,150 − 100,000 = 432,150 × 10% × 2 = 86,430
    expect(b.parts.map((p) => Math.round(p.eur))).toEqual([30000, 5700, 86430]);
    expect(Math.round(b.total)).toBe(122130);
    expect(b.complete).toBe(true);
  });
  it('converts allowances with FX and taxes GB at estate level; unknown wealth taxes → incomplete', () => {
    const b = sampleBill(d, 'GB', client);
    // CGT: (100,000 − £3,000×1.2) × 30% = 28,920 → 1,071,080; estate (1,071,080 − £100,000×1.2) × 10% = 95,108
    expect(Math.round(b.parts[0].eur)).toBe(28920);
    expect(Math.round(b.parts[2].eur)).toBe(95108);
    expect(b.complete).toBe(false);
    expect(b.parts[1].missing.length).toBe(3);
  });
  it('solidarity tax credits the net wealth tax: pays the larger, not both', () => {
    const e = { ...d, rates: [...d.rates, R('ES', 'WEALTH_NET', 2, { threshold_amount: 0 }), R('ES', 'WEALTH_SOLIDARITY', 3, { threshold_amount: 0 })],
      jurisdictions: [...d.jurisdictions, J('ES')] } as unknown as Dashboard;
    // no CGT row → v stays 1,100,000 after growth; net 2% = 22,000, solidarity 3% = 33,000 → pays 33,000
    expect(Math.round(sampleBill(e, 'ES', client).parts[1].eur)).toBe(33000);
  });
  it('toEur returns null when the currency has no rate', () => {
    expect(toEur(d, 'MU', 100)).toBeNull();
    expect(toEur(d, 'GB', 100)).toBe(120);
  });
});

describe('gates', () => {
  it('treaty from the treaty table, blacklist from gates, missing = unknown', () => {
    const g = gateCells(d, 'XX', 'MU');
    expect(g.map((x) => x.status)).toEqual(['green', 'red', 'unknown', 'unknown']);
    expect(gateCells(d, 'YY', 'MU')[0]).toMatchObject({ status: 'red', label: 'No treaty' });
  });
});

describe('opportunities', () => {
  it('scores market + pain + ease equally and sorts high to low', () => {
    const o = opportunities(d, ['XX', 'YY'], 'MU');
    expect(o[0].code).toBe('XX');
    // XX: market 1, pain 1 (only bill), ease (green 1 + red 0)/2 = 0.5 → 83
    expect(o[0].score).toBe(83);
    expect(o[1]).toMatchObject({ code: 'YY', market: { v01: 0.5 }, ease: { v01: 0, known: true } });
  });
});

describe('momentum', () => {
  it('up when the latest row is higher than the one before; flat with a single row', () => {
    expect(momentum(d, 'XX', 'CGT_FINANCIAL')).toMatchObject({ dir: 'up', now: 30, prev: 25 });
    expect(momentum(d, 'YY', 'CGT_FINANCIAL')).toMatchObject({ dir: 'flat', prev: null });
    expect(momentum(d, 'GB', 'WEALTH_NET').dir).toBe('unknown');
  });
});

describe('savingGap', () => {
  it('country minus hub, positive = the country taxes more; unknown stays null', () => {
    const g = savingGap(d, 'XX', 'MU');
    expect(g.find((x) => x.t.code === 'CGT_FINANCIAL')?.gap).toBe(30);
    expect(g.find((x) => x.t.code === 'INHERITANCE_DIRECT')?.gap).toBeNull();
  });
});
