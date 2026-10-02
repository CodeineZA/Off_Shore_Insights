import { describe, expect, it } from 'vitest';
import type { Dashboard } from './types';
import { gateCells } from './model';

const J = (code: string, extra = {}) => ({ code, name: code, parent_code: null, kind: 'country', currency: 'EUR', tax_year_start: null,
  next_budget_date: null, is_offshore_hub: false, notes: null, lon: 0, lat: 0, ...extra });

const d = {
  jurisdictions: [J('XX'), J('YY'), J('MU', { is_offshore_hub: true })],
  treaties: [{ country_a: 'MU', country_b: 'XX', status: 'in_force', in_force_on: '1982-09-17', mli_note: null, source_url: null },
    { country_a: 'MU', country_b: 'YY', status: 'none', in_force_on: null, mli_note: null, source_url: null }],
  gates: [{ jurisdiction_code: 'XX', hub: 'MU', gate: 'blacklist', status: 'red', label: 'Listed', note: null, source_url: null, needs_verification: false }],
} as unknown as Dashboard;

describe('gates', () => {
  it('treaty from the treaty table, blacklist from gates, missing = unknown', () => {
    const g = gateCells(d, 'XX', 'MU');
    expect(g.map((x) => x.status)).toEqual(['green', 'red', 'unknown']);
    expect(gateCells(d, 'YY', 'MU')[0]).toMatchObject({ status: 'red', label: 'No treaty' });
  });
  it('the Mauritius treaty counts for Seychelles too; a region uses its country\'s treaty and lists', () => {
    const dd = { ...d, jurisdictions: [...d.jurisdictions, J('XX-R', { kind: 'region', parent_code: 'XX' })],
      treaties: [...d.treaties, { country_a: 'SC', country_b: 'XX', status: 'none', in_force_on: null, mli_note: null, source_url: null }] } as unknown as Dashboard;
    expect(gateCells(dd, 'XX', 'SC')[0]).toMatchObject({ status: 'green', label: 'In force' });   // not SC's "none"
    expect(gateCells(dd, 'XX', 'SC')[0].note).toMatch(/Via Mauritius/);
    const r = gateCells(dd, 'XX-R', 'MU');
    expect(r.map((x) => x.status)).toEqual(['green', 'red', 'unknown']);
  });
});
