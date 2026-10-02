import { describe, expect, it } from 'vitest';
import type { Dashboard } from './types';
import { classify, contextLabel, countSources, safeUrl, sourcesFor, type SourceContext } from './sources';

const J = (code: string, extra = {}) => ({ code, name: code, parent_code: null, kind: 'country', currency: 'EUR', tax_year_start: '01-01', next_budget_date: null,
  is_offshore_hub: false, notes: null, lon: 1, lat: 2, regional_tax_types: [], ...extra });
const H = (j: string, t: string, rate: number, from: string, source_url: string | null, extra = {}) => ({ id: Math.random(), jurisdiction_code: j, tax_type_code: t,
  headline_rate: rate, valid_from: from, valid_to: null, verified_on: '2026-09-30', needs_verification: false, source_url, ...extra });
const T = (code: string, category: string, sort_order: number) => ({ code, label: `${code} label`, category, applies_to: ['individual'], is_recurring: false, description: null, sort_order });
const W = (j: string, year: number, ref_date: string, extra = {}) => ({ id: Math.random(), jurisdiction_code: j, year, ref_date, millionaires: null, uhnwi_count: null, business_owners: null,
  source: 'X', source_url: null, verified_on: '2026-09-30', ...extra });

const BD = 'https://www.belastingdienst.nl/box3';
const SNAP = 'https://web.archive.org/web/20251111093000/https://www.belastingdienst.nl/box2';
const PWC = 'https://taxsummaries.pwc.com/netherlands/individual/other-taxes';
const UBS = 'https://www.ubs.com/global/en/wealthmanagement/insights/global-wealth-report.html';
const d = {
  jurisdictions: [J('NL'), J('BE', { regional_tax_types: ['INHERITANCE_DIRECT'] }), J('BE-V', { kind: 'region', parent_code: 'BE', name: 'Flanders' }), J('MU', { is_offshore_hub: true }), J('SC', { is_offshore_hub: true })],
  tax_types: [T('CGT_FINANCIAL', 'investment', 10), T('INHERITANCE_DIRECT', 'estate', 60), T('WEALTH_NET', 'wealth', 80)],
  rate_history: [
    H('NL', 'CGT_FINANCIAL', 36, '2025-01-01', BD), H('NL', 'WEALTH_NET', 2.1, '2025-01-01', SNAP), H('NL', 'INHERITANCE_DIRECT', 20, '2025-01-01', PWC, { needs_verification: true }),
    H('MU', 'CGT_FINANCIAL', 0, '2020-01-01', 'https://www.mra.mu/tax'), H('SC', 'CGT_FINANCIAL', 0, '2020-01-01', null),
    H('BE', 'CGT_FINANCIAL', 10, '2025-01-01', 'javascript:alert(1)'), H('BE-V', 'INHERITANCE_DIRECT', 27, '2025-01-01', 'https://www.vlaanderen.be/x'),
  ],
  treaties: [{ country_a: 'MU', country_b: 'NL', status: 'none', verified_on: '2026-09-30', source_url: 'https://www.mra.mu/dta' },
    { country_a: 'SC', country_b: 'NL', status: 'none', verified_on: '2026-09-30', source_url: 'https://src.gov.sc/agreements/' },
    { country_a: 'MU', country_b: 'BE', status: 'in_force', verified_on: '2026-09-30', source_url: PWC }],
  gates: [{ jurisdiction_code: 'NL', hub: 'MU', gate: 'blacklist', status: 'green', label: 'Not listed', verified_on: '2026-09-30', needs_verification: false, source_url: 'https://wetten.overheid.nl/BWBR0041785' },
    { jurisdiction_code: 'BE', hub: null, gate: 'trust_recognition', status: 'amber', label: 'Not a party', verified_on: '2026-09-30', needs_verification: false, source_url: 'https://www.hcch.net/x' }],
  wealth: [
    W('NL', 2025, '2025-12-31', { millionaires: 1_200_000, source: 'UBS Global Wealth Report 2026', source_url: UBS }),
    W('NL', 2025, '2025-12-31', { uhnwi_count: 5077, source: 'Knight Frank Wealth Report 2026', source_url: 'https://www.knightfrank.com/wealthreport' }),
    W('BE', 2025, '2025-12-31', { millionaires: 900_000, source: 'UBS Global Wealth Report 2026', source_url: UBS }),
  ],
  notes: [{ id: 1, jurisdiction_code: 'NL', topic: 'warning', text: 't', source_url: 'https://ancova-associates.com/x', verified_on: '2026-09-30', sort_order: 1 },
    { id: 2, jurisdiction_code: 'NL', topic: 'crs', text: 't', source_url: '', verified_on: null, sort_order: 2 }],
} as unknown as Dashboard;

const ctx = (extra: Partial<SourceContext> = {}): SourceContext => ({ code: 'NL', years: [2025], taxFocus: null, metrics: ['millionaires'], treaty: true, money: true, ...extra });
const group = (id: string, c: SourceContext) => sourcesFor(d, c).find((g) => g.id === id);

describe('classifying a source address', () => {
  it('names the publisher and tags only what it can recognise', () => {
    expect(classify(BD)).toMatchObject({ kind: 'official', host: 'belastingdienst.nl' });
    expect(classify(PWC)).toMatchObject({ kind: 'secondary', name: 'PwC Worldwide Tax Summaries' });
    expect(classify('https://www.knightfrank.com/wealthreport').kind).toBe('report');
    expect(classify('https://ec.europa.eu/eurostat/databrowser/view/lfsa_egaps/default/table').kind).toBe('data');
    expect(classify('https://www.gov.uk/guidance/x').kind).toBe('official');
    expect(classify('https://www.expatica.com/x')).toMatchObject({ kind: 'unknown', name: 'expatica.com' });   // never guessed
    expect(classify(null)).toMatchObject({ kind: 'unknown', name: 'No source recorded' });
  });
  it('a dated Wayback copy is judged by the page it copies', () => {
    expect(classify(SNAP)).toMatchObject({ kind: 'official', host: 'belastingdienst.nl' });
  });
  it('only web addresses ever become links', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('  https://x.org/a ')).toBe('https://x.org/a');
    expect(safeUrl('')).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});

describe('sources for a country', () => {
  it('rates: pages are merged, hubs come along, and a dated copy says when it was taken and links the original', () => {
    const rates = group('rates', ctx())!.entries;
    expect(rates.map((e) => e.url)).toEqual(expect.arrayContaining([BD, SNAP, PWC, 'https://www.mra.mu/tax']));
    const snap = rates.find((e) => e.url === SNAP)!;
    expect(snap.archived).toEqual({ on: '2025-11-11', original: 'https://www.belastingdienst.nl/box2' });
    expect(snap.supports).toEqual(['Net wealth 2.1% (2025)']);
    expect(snap.shown).toBe('belastingdienst.nl/box2');                       // the page that was copied, not the archive's address
    expect(rates.find((e) => e.url === PWC)!.shown).toBe('taxsummaries.pwc.com/netherlands/individual/other-taxes');   // two pages by one publisher stay tellable apart
    expect(rates.find((e) => e.url === BD)!.supports).toEqual(['CGT shares 36% (2025)']);
    expect(rates.find((e) => e.url === 'https://www.mra.mu/tax')!.supports).toEqual(['Mauritius: CGT shares 0%']);
  });
  it('a rate with no recorded source is listed as having none, not left out', () => {
    const none = group('rates', ctx())!.entries.find((e) => e.url === null)!;
    expect(none).toMatchObject({ name: 'No source recorded', kind: 'unknown' });
    expect(none.supports).toEqual(['Seychelles: CGT shares 0%']);
  });
  it('a row that needs verifying carries the flag to its source', () => {
    expect(group('rates', ctx())!.entries.find((e) => e.url === PWC)!.check).toBe(true);
    expect(group('rates', ctx())!.entries.find((e) => e.url === BD)!.check).toBe(false);
  });
  it('the tax focus narrows the rates to that market, hubs included', () => {
    const only = group('rates', ctx({ taxFocus: { category: 'wealth' } }))!.entries;
    expect(only.map((e) => e.url)).toEqual([SNAP]);                  // CGT and inheritance sources are gone; MU/SC have no wealth rate
    expect(group('rates', ctx({ taxFocus: { taxType: 'CGT_FINANCIAL' } }))!.entries.map((e) => e.url)).toEqual(expect.arrayContaining([BD, 'https://www.mra.mu/tax']));
  });
  it('several years list each year\'s rate row', () => {
    const e = group('rates', ctx({ years: [2024, 2025] }))!.entries.find((x) => x.url === BD)!;
    expect(e.supports).toEqual(['CGT shares 36% (2025)']);          // no 2024 row exists: no invented support
  });
  it('treaties and lists come from their own pages', () => {
    expect(group('treaties', ctx())!.entries.map((e) => e.url)).toEqual(['https://www.mra.mu/dta', 'https://src.gov.sc/agreements/']);
    expect(group('lists', ctx())!.entries.map((e) => [e.url, e.kind])).toEqual([['https://wetten.overheid.nl/BWBR0041785', 'official']]);
  });
  it('prospect pool: the report is named with its edition and the local file; carried-forward years are said so', () => {
    const money = group('money', ctx({ years: [2025, 2026] }))!.entries;
    const ubs = money.find((e) => e.url === UBS)!;
    expect(ubs).toMatchObject({ name: 'UBS Global Wealth Report 2026', kind: 'report', file: 'PDFs/global-wealth-report-en-2026.pdf' });
    expect(ubs.supports).toEqual(['Millionaires 1.2M (2025)', 'Millionaires 1.2M (2025, carried forward)']);
    expect(money.find((e) => e.url === 'https://www.knightfrank.com/wealthreport')!.file).toBe('PDFs/146815_the-wealth-report-2026.pdf');
  });
  it('notes appear only with a real web address', () => {
    expect(group('notes', ctx())!.entries.map((e) => e.url)).toEqual(['https://ancova-associates.com/x']);
  });
});

describe('sources for a region and for the world', () => {
  it('a region takes its country\'s treaty, lists and money, and says where an inherited rate comes from', () => {
    const c = ctx({ code: 'BE-V' });
    expect(group('treaties', c)!.entries.map((e) => e.url)).toEqual([PWC]);
    expect(group('lists', c)!.entries.map((e) => e.url)).toEqual(['https://www.hcch.net/x']);
    expect(group('money', c)!.entries[0].supports[0]).toBe('Millionaires 900k (2025)');
    expect(group('rates', c)!.entries.map((e) => e.url)).toEqual(expect.arrayContaining(['https://www.vlaanderen.be/x']));
  });
  it('the world view lists only the layers that are on, and never a tax rate', () => {
    const w = (extra: Partial<SourceContext>) => sourcesFor(d, ctx({ code: null, ...extra }));
    expect(w({}).map((g) => g.id)).toEqual(['treaties', 'money']);
    expect(w({ treaty: false }).map((g) => g.id)).toEqual(['money']);
    expect(w({ money: false }).map((g) => g.id)).toEqual(['treaties']);
    expect(w({ treaty: false, money: false })).toEqual([]);
    expect(w({ treaty: false, metrics: ['uhnwi_count'] })[0].entries.map((e) => e.name)).toEqual(['Knight Frank Wealth Report 2026']);
    expect(w({}).find((g) => g.id === 'money')!.title).toBe('Money bars on the map');       // the pool panel is not on screen at world level
    expect(group('money', ctx())!.title).toBe('Prospect pool');
  });
  it('counts pages once, however many figures cite them', () => {
    const groups = sourcesFor(d, ctx({ years: [2025, 2026] }));
    expect(countSources(groups)).toBe(new Set(groups.flatMap((g) => g.entries.map((e) => e.key))).size);
    expect(contextLabel(d, ctx({ years: [2026, 2025] }))).toBe('NL · tax years 2025, 2026');
    expect(contextLabel(d, ctx({ code: null }))).toBe('World map: treaty colours and money bars');
  });
});
