import { describe, expect, it } from 'vitest';
import type { Dashboard } from './types';
import { countries, nameOf, pct, rateOf } from './insights';

const J = (code: string, name: string, extra: Partial<Dashboard['jurisdictions'][number]> = {}) => ({
  code, name, parent_code: null, kind: 'country' as const, currency: 'EUR', tax_year_start: '01-01', next_budget_date: null,
  is_offshore_hub: false, notes: null, lon: 0, lat: 0, ...extra,
});
const fixture = () => ({
  jurisdictions: [J('PT', 'Portugal'), J('FR', 'France'), J('ES-MD', 'Madrid', { kind: 'region', parent_code: 'ES' }),
    J('MU', 'Mauritius', { is_offshore_hub: true }), J('ZA', 'South Africa')],
  rates: [{ jurisdiction_code: 'FR', tax_type_code: 'CGT_FINANCIAL', headline_rate: 31.4 }],
}) as unknown as Dashboard;

describe('shared helpers', () => {
  it('countries: target countries only (no regions, no hubs), in display order', () => {
    expect(countries(fixture()).map((c) => c.code)).toEqual(['FR', 'ZA', 'PT']);
  });
  it('rateOf: unknown is undefined, not zero', () => {
    expect(rateOf(fixture(), 'FR', 'CGT_FINANCIAL')?.headline_rate).toBe(31.4);
    expect(rateOf(fixture(), 'PT', 'CGT_FINANCIAL')).toBeUndefined();
  });
  it('nameOf / pct', () => {
    expect(nameOf(fixture(), 'MU')).toBe('Mauritius');
    expect(nameOf(fixture(), 'XX')).toBe('XX');
    expect(pct(26.375)).toBe('26.4%');
  });
});
