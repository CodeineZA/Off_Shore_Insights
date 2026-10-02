import { describe, expect, it } from 'vitest';
import type { Dashboard } from './types';
import { bannerFacts, treatyText } from './banner';
import { focusLabel, inFocus, scaleMax, taxBars, toggleFocus } from './taxbars';
import { toggleYear } from './years';

const J = (code: string, extra = {}) => ({ code, name: code, parent_code: null, kind: 'country', currency: 'EUR', tax_year_start: '01-01', next_budget_date: null,
  is_offshore_hub: false, notes: null, lon: 1, lat: 2, regional_tax_types: [], structure_checked_on: null, structure_note: null, ...extra });
const H = (j: string, t: string, rate: number, from: string, to: string | null = null, verified = '2026-09-30') => ({ id: Math.random(), jurisdiction_code: j, tax_type_code: t,
  headline_rate: rate, valid_from: from, valid_to: to, verified_on: verified, needs_verification: false });
const T = (code: string, category: string, sort_order: number) => ({ code, label: `${code} label`, category, applies_to: ['individual'], is_recurring: false, description: null, sort_order });
const G = (j: string, hub: string | null, gate: string, status: string, label: string) => ({ id: 1, jurisdiction_code: j, hub, gate, status, label, note: null, source_url: null, verified_on: '2026-09-30', next_check_on: '2027-01-01', needs_verification: false });

const d = {
  jurisdictions: [J('BE', { regional_tax_types: ['INH'], structure_checked_on: '2026-09-30', structure_note: 'Inheritance tax is set by the 3 regions' }),
    J('BE-V', { kind: 'region', parent_code: 'BE', name: 'Flanders' }), J('GB', { tax_year_start: '04-06' }), J('MU', { is_offshore_hub: true, tax_year_start: '07-01' }), J('SC', { is_offshore_hub: true })],
  tax_types: [T('INH', 'estate', 60), T('CGT', 'investment', 10), T('WNET', 'wealth', 80), T('FOREIGN', 'anti_offshore', 100)],
  rate_history: [H('BE', 'CGT', 10, '2024-01-01', null, '2026-09-30'), H('BE-V', 'INH', 27, '2025-01-01'), H('MU', 'CGT', 0, '2020-01-01'), H('MU', 'INH', 0, '2020-01-01'), H('SC', 'INH', 0, '2020-01-01'),
    H('BE', 'FOREIGN', 0, '2024-01-01'), H('GB', 'CGT', 24, '2025-04-06')],
  treaties: [{ country_a: 'MU', country_b: 'BE', status: 'in_force', signed_on: '1999-05-24', in_force_on: '2000-01-01', source_url: 'https://x' },
    { country_a: 'SC', country_b: 'BE', status: 'in_force', signed_on: null, in_force_on: null, source_url: null }],
  gates: [G('BE', 'MU', 'blacklist', 'green', 'Not listed'), G('BE', 'SC', 'blacklist', 'amber', 'Reporting list'), G('BE', null, 'trust_recognition', 'amber', 'Not a party')],
  wealth: [], fx: [],
} as unknown as Dashboard;

describe('banner: what the country brief states first', () => {
  it('both treaties with status and date, tax year beside when the data was last checked', () => {
    const b = bannerFacts(d, 'BE', [2026])!;
    expect(b.treaties[0]).toMatchObject({ hub: 'MU', status: 'in_force', text: 'In force since 01 Jan 2000', date: '2000-01-01' });
    expect(b.treaties[1].text).toBe('In force, date to confirm');             // a missing date says so; it is never invented
    expect(b.kicker).toBe('Tax year 2026 (1 Jan–31 Dec 2026) · rates last checked 30 Sep 2026');
    expect(b.headline).toBe('BE: treaty with Mauritius in force, with Seychelles in force');
    expect(b.standfirst).toBe('Inheritance tax is set by the 3 regions');
  });
  it('several years: the tax years are listed', () => {
    expect(bannerFacts(d, 'BE', [2025, 2026])!.kicker).toMatch(/^Tax years 2025, 2026 ·/);
  });
  it('red/green gates', () => {
    const g = bannerFacts(d, 'BE', [2026])!.gates;
    expect(g.map((x) => [x.label, x.status])).toEqual([['Blacklist, Mauritius', 'green'], ['Blacklist, Seychelles', 'amber'], ['Trust recognition', 'amber']]);
  });
  it('a region says it takes the treaty, lists and money from its country, and names what it sets itself', () => {
    const b = bannerFacts(d, 'BE-V', [2026])!;
    expect(b.isRegion).toBe(true);
    expect(b.treaties[0].status).toBe('in_force');       // Belgium's treaty
    expect(b.standfirst).toBe('Flanders sets its own inh label. Everything else, the treaties, the lists and the money figures, comes from BE.');
    expect(b.updated).toBe('2026-09-30');
  });
  it('a country not yet checked for regional taxes says so', () => {
    expect(bannerFacts(d, 'GB', [2025])!.standfirst).toBe('Which taxes are set by regions has not been checked yet.');
    expect(bannerFacts(d, 'GB', [2025])!.kicker).toMatch(/^Tax year 2025\/26 \(6 Apr 2025–5 Apr 2026\)/);
  });
  it("treaty wording for each status; today's status is flagged when an earlier year cannot be proven", () => {
    const t = (status: string, extra = {}) => ({ status, signed_on: null, in_force_on: null, ...extra }) as never;
    expect(treatyText(t('signed_not_in_force', { signed_on: '2025-07-01' }), { status: 'signed_not_in_force', known: true, since: null }).text).toBe('Signed 01 Jul 2025, not yet in force');
    expect(treatyText(t('negotiating'), { status: 'negotiating', known: true, since: null }).text).toBe('Under negotiation');
    expect(treatyText(t('none'), { status: 'none', known: false, since: null }).text).toBe("No treaty (today's status)");
    expect(treatyText(undefined, null)).toMatchObject({ status: 'unknown', text: 'No treaty data yet' });
  });
  it('no years selected, or an unknown code, gives no banner', () => {
    expect(bannerFacts(d, 'BE', [])).toBeNull();
    expect(bannerFacts(d, 'ZZ', [2026])).toBeNull();
  });
});

describe('tax slicer data', () => {
  it('groups by market in the order estate → wealth → investment, warnings last; unknown stays null', () => {
    const g = taxBars(d, 'BE', [2026]);
    expect(g.map((x) => x.category)).toEqual(['estate', 'investment', 'anti_offshore']);   // wealth has no figure anywhere, so no row
    const estate = g[0].rows[0];
    expect(estate.years[0].rate).toBeNull();                   // BE has no national inheritance rate…
    expect(estate.hub).toEqual({ MU: 0, SC: 0 });              // …but the hubs do, so the row shows the gap honestly
    expect(g[1].rows[0]).toMatchObject({ hub: { MU: 0, SC: null }, years: [{ rate: 10 }] });
  });
  it('the scale covers the regional dots too: a country with no national inheritance rate still fits its 80% region', () => {
    const be = { ...d, rate_history: [...d.rate_history, H('BE-W', 'INH', 80, '2025-01-01')], jurisdictions: [...d.jurisdictions, J('BE-W', { kind: 'region', parent_code: 'BE', name: 'Wallonia' })] } as unknown as Dashboard;
    const g = taxBars(be, 'BE', [2026]);
    expect(g.find((x) => x.category === 'estate')!.rows[0].regions?.map((r) => r.rate)).toEqual([27, 80]);
    expect(scaleMax(g)).toBeGreaterThanOrEqual(80);
  });
  it('one cell per selected year; a region marks the taxes it takes from its country', () => {
    const g = taxBars(d, 'BE-V', [2024, 2025, 2026]);
    const cgt = g.find((x) => x.category === 'investment')!.rows[0];
    expect(cgt.years.map((c) => [c.year, c.rate, c.inherited])).toEqual([[2024, 10, true], [2025, 10, true], [2026, 10, true]]);
    const inh = g.find((x) => x.category === 'estate')!.rows[0];
    expect(inh.years.map((c) => [c.year, c.rate, c.inherited])).toEqual([[2024, null, false], [2025, 27, false], [2026, 27, false]]);
  });
  it('focus: a market or a single tax; clicking the focused one clears it', () => {
    const [inh, cgt] = [d.tax_types[0], d.tax_types[1]];
    expect(inFocus(inh, null)).toBe(true);
    expect(inFocus(inh, { category: 'estate' })).toBe(true);
    expect(inFocus(cgt, { category: 'estate' })).toBe(false);
    expect(inFocus(cgt, { taxType: 'CGT' })).toBe(true);
    expect(toggleFocus(null, { category: 'estate' })).toEqual({ category: 'estate' });
    expect(toggleFocus({ category: 'estate' }, { category: 'estate' })).toBeNull();
    expect(toggleFocus({ category: 'estate' }, { taxType: 'CGT' })).toEqual({ taxType: 'CGT' });
    expect(focusLabel(d, { category: 'estate' })).toBe('Estate & inheritance');
    expect(focusLabel(d, { taxType: 'CGT' })).toBe('CGT label');
    expect(focusLabel(d, null)).toBeNull();
  });
});

describe('year chips', () => {
  it('toggle any combination; the last year cannot be switched off', () => {
    expect(toggleYear([2026], 2025)).toEqual([2025, 2026]);
    expect(toggleYear([2025, 2026], 2026)).toEqual([2025]);
    expect(toggleYear([2025], 2025)).toEqual([2025]);
    expect(toggleYear([2024, 2026], 2025)).toEqual([2024, 2025, 2026]);
  });
});
