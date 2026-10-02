import { describe, expect, it } from 'vitest';
import type { Dashboard } from './types';
import { briefNotes } from './banner';
import { poolMax, POOL_KEYS, prospectPool } from './pool';
import { cellText, taxBars } from './taxbars';

const J = (code: string, extra = {}) => ({ code, name: code, parent_code: null, kind: 'country', currency: 'EUR', tax_year_start: '01-01', next_budget_date: null,
  is_offshore_hub: false, notes: null, lon: 1, lat: 2, regional_tax_types: [], ...extra });
const W = (j: string, year: number, ref_date: string, extra = {}) => ({ id: Math.random(), jurisdiction_code: j, year, ref_date, millionaires: null, uhnwi_count: null, business_owners: null,
  source: 'UBS Global Wealth Report 2026', source_url: 'https://ubs.example/r', verified_on: '2026-09-30', ...extra });

const d = {
  jurisdictions: [J('NL'), J('BE'), J('BE-V', { kind: 'region', parent_code: 'BE', name: 'Flanders' }), J('MU', { is_offshore_hub: true }), J('SC', { is_offshore_hub: true })],
  wealth: [
    W('NL', 2024, '2024-06-30', { business_owners: 800_000, source: 'Eurostat', source_url: 'https://eurostat.example' }),
    W('NL', 2025, '2025-12-31', { millionaires: 1_200_000 }),
    W('NL', 2025, '2025-12-31', { uhnwi_count: 5077, source: 'Knight Frank Wealth Report 2026' }),
    W('BE', 2025, '2025-12-31', { millionaires: 900_000 }),
  ],
} as unknown as Dashboard;
const row = (code: string, years: number[], key: string) => prospectPool(d, code, years)!.rows.find((r) => r.key === key)!;

describe('prospect pool', () => {
  it('four tiers, in order', () => {
    expect(prospectPool(d, 'NL', [2025])!.rows.map((r) => r.key)).toEqual(POOL_KEYS);
  });
  it('one cell per selected year; a year with no figure of its own shows the newest earlier one, marked', () => {
    const m = row('NL', [2024, 2025, 2026], 'millionaires').cells;
    expect(m.map((c) => [c.year, c.value, c.carried, c.asAt])).toEqual([[2024, null, false, null], [2025, 1_200_000, false, 2025], [2026, 1_200_000, true, 2025]]);
    const b = row('NL', [2024, 2025], 'business_owners').cells;
    expect(b.map((c) => [c.value, c.carried])).toEqual([[800_000, false], [800_000, true]]);
  });
  it('unknown is never 0: a tier nobody publishes has no value in any year', () => {
    const t = row('NL', [2024, 2025, 2026], 'trusts_count');
    expect(t.cells.every((c) => c.value === null && !c.carried)).toBe(true);
    expect(t.latest.value).toBeNull();
  });
  it('each cell keeps its source and the date it is as at', () => {
    expect(row('NL', [2025], 'uhnwi_count').latest).toMatchObject({ value: 5077, source: 'Knight Frank Wealth Report 2026', refDate: '2025-12-31', verifiedOn: '2026-09-30' });
  });
  it('the tax year label belongs to the figure\'s own country', () => {
    expect(row('NL', [2025], 'millionaires').latest.label).toBe('2025');
  });
  it('a region shows its country\'s figures and says so', () => {
    const p = prospectPool(d, 'BE-V', [2025])!;
    expect(p).toMatchObject({ owner: 'BE', inherited: true });
    expect(p.rows.find((r) => r.key === 'millionaires')!.latest.value).toBe(900_000);
    expect(prospectPool(d, 'NL', [2025])!.inherited).toBe(false);
  });
  it('nothing selected, or an unknown code, gives no pool', () => {
    expect(prospectPool(d, 'NL', [])).toBeNull();
    expect(prospectPool(d, 'ZZ', [2025])).toBeNull();
  });
  it('one shared scale: the widest figure; with nothing known it is 1, never 0', () => {
    expect(poolMax(prospectPool(d, 'NL', [2025])!.rows)).toBe(1_200_000);
    expect(poolMax(prospectPool(d, 'MU', [2025])!.rows)).toBe(1);
  });
});

describe('country brief notes', () => {
  const n = (id: number, jurisdiction_code: string, topic: string, sort_order: number) => ({ id, jurisdiction_code, topic, text: topic, source_url: null, verified_on: null, sort_order });
  const e = {
    jurisdictions: [J('BE'), J('BE-V', { kind: 'region', parent_code: 'BE' })],
    tax_types: [{ code: 'CGT_FINANCIAL', label: 'x', category: 'investment', sort_order: 1 }],
    notes: [n(1, 'BE', 'sales_angle', 1), n(2, 'BE-V', 'residency', 1), n(3, 'BE', 'warning', 2), n(4, 'BE', 'odd_topic', 3), n(5, 'XX', 'warning', 1), n(6, 'BE', 'anti_avoidance', 1)],
    rates: [{ jurisdiction_code: 'BE-V', tax_type_code: 'CGT_FINANCIAL', needs_verification: true, inherited: false }, { jurisdiction_code: 'BE-V', tax_type_code: 'CGT_FINANCIAL', needs_verification: true, inherited: true }],
  } as unknown as Dashboard;
  it('warnings first, a region shows its own notes and its country\'s, other countries\' are left out', () => {
    expect(briefNotes(e, 'BE-V').notes.map((x) => x.topic)).toEqual(['warning', 'anti_avoidance', 'residency', 'sales_angle', 'odd_topic']);
    expect(briefNotes(e, 'BE').notes.map((x) => x.id)).toEqual([3, 6, 1, 4]);
  });
  it('lists only the entity\'s own figures that still need verifying, not ones it inherits', () => {
    expect(briefNotes(e, 'BE-V').toCheck).toEqual(['CGT shares']);
    expect(briefNotes(e, 'BE').toCheck).toEqual([]);
  });
});

describe('hover text on a tax bar', () => {
  const h = (extra = {}) => ({ id: 1, jurisdiction_code: 'NL', tax_type_code: 'INH', headline_rate: 20, valid_from: '2025-01-01', valid_to: null, verified_on: '2026-09-30', needs_verification: false,
    rate_min: null, rate_max: null, threshold_note: null, note: null, source_url: 'https://www.belastingdienst.nl/x', ...extra });
  const bars = (row: object) => taxBars({ jurisdictions: [J('NL'), J('MU', { is_offshore_hub: true }), J('SC', { is_offshore_hub: true })],
    tax_types: [{ code: 'INH', label: 'Inheritance', category: 'estate', sort_order: 1 }], rate_history: [row] } as unknown as Dashboard, 'NL', [2025])[0].rows[0].years[0];
  it('rate, range, threshold, note, the verify flag and where it came from', () => {
    const t = cellText(bars(h({ rate_min: 10, rate_max: 40, threshold_note: 'Above EUR 25,000', note: 'Per heir', needs_verification: true })));
    expect(t.split('\n')).toEqual(['2025: 20%', 'Range 10% to 40%', 'Above EUR 25,000', 'Per heir', 'To verify.', 'belastingdienst.nl · verified 30 Sep 2026']);
  });
  it('a plain rate shows just the rate and its source; no source says so', () => {
    expect(cellText(bars(h())).split('\n')).toEqual(['2025: 20%', 'belastingdienst.nl · verified 30 Sep 2026']);
    expect(cellText(bars(h({ source_url: null }))).split('\n')[1]).toBe('no source yet · verified 30 Sep 2026');
  });
  it('no figure for the year says so', () => {
    const none = taxBars({ jurisdictions: [J('NL'), J('MU', { is_offshore_hub: true })], tax_types: [{ code: 'INH', label: 'Inheritance', category: 'estate', sort_order: 1 }],
      rate_history: [{ ...h(), jurisdiction_code: 'MU' }] } as unknown as Dashboard, 'NL', [2025])[0].rows[0].years[0];
    expect(cellText(none)).toBe('2025: no figure');
  });
});
