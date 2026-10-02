import { describe, expect, it } from 'vitest';
import type { Dashboard } from './types';
import { countries, countryOf, nameOf, pct, rateOf } from './insights';

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
  it('countries: a country with regional taxes is listed as its regions; the national entry stays only when complete', () => {
    const d = {
      jurisdictions: [J('BE', 'Belgium', { regional_tax_types: ['INHERITANCE_DIRECT'] }), J('BE-VLG', 'Flanders', { kind: 'region', parent_code: 'BE' }),
        J('ES', 'Spain', { regional_tax_types: ['INHERITANCE_DIRECT'] }), J('ES-MD', 'Madrid (Community)', { kind: 'region', parent_code: 'ES' }), J('FR', 'France')],
      rates: [{ jurisdiction_code: 'ES', tax_type_code: 'INHERITANCE_DIRECT', headline_rate: 34 },
        { jurisdiction_code: 'BE-VLG', tax_type_code: 'INHERITANCE_DIRECT', headline_rate: 27 }],
    } as unknown as Dashboard;
    expect(countries(d).map((c) => c.code)).toEqual(['FR', 'BE-VLG', 'ES', 'ES-MD']);   // Belgium has no own inheritance rate
    expect(nameOf(d, 'ES-MD')).toBe('Madrid (ES)');
    expect(nameOf(d, 'ES')).toBe('Spain (national rules)');
    expect(nameOf(d, 'FR')).toBe('France');
    expect(countryOf(d, 'BE-VLG')).toBe('BE');
  });
  it('nameOf / pct', () => {
    expect(nameOf(fixture(), 'MU')).toBe('Mauritius');
    expect(nameOf(fixture(), 'XX')).toBe('XX');
    expect(pct(26.375)).toBe('26.4%');
  });
});

describe('plain-English explanations of tax types', () => {
  it('every tax type with a short label has one, and abbreviations are spelled out', async () => {
    const { EXPLAIN, SHORT } = await import('./insights');
    for (const code of Object.keys(SHORT)) expect(EXPLAIN[code], code).toBeTruthy();
    for (const [code, label] of Object.entries(SHORT)) {
      if (/CGT/.test(label)) expect(EXPLAIN[code], code).toMatch(/capital gains tax/i);
      if (/WHT/.test(label)) expect(EXPLAIN[code], code).toMatch(/withholding tax/i);
    }
  });
  it('falls back to the stored description for a tax type it does not know', async () => {
    const { explainOf } = await import('./insights');
    expect(explainOf({ code: 'NEW_TAX', description: 'Stored text' } as never)).toBe('Stored text');
    expect(explainOf({ code: 'NEW_TAX', description: null } as never)).toBe('');
  });
});
