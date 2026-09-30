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

describe('G4 heatmap', () => {
  const T = (code: string, category: string, applies_to: string[], sort_order: number) => ({ code, label: code, category, applies_to, is_recurring: false, description: null, sort_order });
  const d = () => ({ ...fixture(),
    tax_types: [T('INHERITANCE_DIRECT', 'estate', ['individual', 'trust'], 60), T('CGT_FINANCIAL', 'investment', ['individual', 'trust', 'company'], 10),
      T('WEALTH_NET', 'wealth', ['individual', 'trust'], 80)],
    rates: [{ jurisdiction_code: 'FR', tax_type_code: 'CGT_FINANCIAL', headline_rate: 31.4 }, { jurisdiction_code: 'FR', tax_type_code: 'WEALTH_NET', headline_rate: 0 }],
  }) as unknown as Dashboard;
  it('filters tax types by category and applies-to, in sort order', async () => {
    const { filterTaxTypes } = await import('./insights');
    expect(filterTaxTypes(d(), ['investment', 'estate', 'wealth'], 'all').map((t) => t.code)).toEqual(['CGT_FINANCIAL', 'INHERITANCE_DIRECT', 'WEALTH_NET']);
    // grouped by category order even when sort_order interleaves categories
    const mixed = { ...d(), tax_types: [...d().tax_types, { code: 'INCOME_TOP', label: 'x', category: 'income', applies_to: ['individual'], is_recurring: true, description: null, sort_order: 30 }] } as unknown as Dashboard;
    expect(filterTaxTypes(mixed, ['investment', 'estate', 'wealth', 'income'], 'all').map((t) => t.code)).toEqual(['CGT_FINANCIAL', 'INHERITANCE_DIRECT', 'WEALTH_NET', 'INCOME_TOP']);
    expect(filterTaxTypes(d(), ['investment', 'estate', 'wealth'], 'company').map((t) => t.code)).toEqual(['CGT_FINANCIAL']);
  });
  it('keeps unknown as null and a real 0% as a known 0', async () => {
    const { heatmap, filterTaxTypes } = await import('./insights');
    const h = heatmap(d(), ['FR', 'PT'], filterTaxTypes(d(), ['investment', 'wealth'], 'all'));
    expect(h.rows[0].cells.map((c) => c.rate?.headline_rate ?? null)).toEqual([31.4, 0]);
    expect(h.rows[1].cells.map((c) => c.rate)).toEqual([null, null]);
    expect(h.max).toBe(31.4);
    expect(h).toMatchObject({ known: 2, total: 4 });
  });
});
