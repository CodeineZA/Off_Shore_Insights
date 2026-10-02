import { describe, expect, it } from 'vitest';
import type { Dashboard } from './types';
import { spanText, taxYear, taxYearByStartYear, taxYearFor, taxYearLine, taxYearOf, taxYearStartOf } from './taxyear';

describe('tax years: each country has its own', () => {
  it('a calendar year, labelled by its single year', () => {
    expect(taxYear('01-01', '2026-10-02')).toEqual({ startYear: 2026, start: '2026-01-01', end: '2026-12-31', label: '2026' });
  });
  it('the UK 6 April year is judged on its own dates', () => {
    expect(taxYear('04-06', '2026-04-05')).toEqual({ startYear: 2025, start: '2025-04-06', end: '2026-04-05', label: '2025/26' });
    expect(taxYear('04-06', '2026-04-06').label).toBe('2026/27');
  });
  it('Mauritius runs 1 July to 30 June', () => {
    expect(taxYear('07-01', '2026-06-30')).toMatchObject({ startYear: 2025, end: '2026-06-30', label: '2025/26' });
    expect(taxYear('07-01', '2026-07-01')).toMatchObject({ startYear: 2026, label: '2026/27' });
  });
  it('a 1 March year ends on the right last day, leap years included', () => {
    expect(taxYearByStartYear('03-01', 2026).end).toBe('2027-02-28');
    expect(taxYearByStartYear('03-01', 2027).end).toBe('2028-02-29');
  });
  it('no start recorded falls back to the calendar year', () => {
    expect(taxYear(null, '2026-02-01').label).toBe('2026');
  });
  it('"year 2025" is a different span for each country', () => {
    const d = { jurisdictions: [{ code: 'BE', tax_year_start: '01-01' }, { code: 'GB', tax_year_start: '04-06' }, { code: 'MU', tax_year_start: '07-01' },
      { code: 'BE-VLG', parent_code: 'BE', tax_year_start: null }] } as unknown as Dashboard;
    expect(spanText(taxYearFor(d, 'BE', 2025))).toBe('1 Jan–31 Dec 2025');
    expect(spanText(taxYearFor(d, 'GB', 2025))).toBe('6 Apr 2025–5 Apr 2026');
    expect(taxYearLine(taxYearFor(d, 'MU', 2025))).toBe('Tax year 2025/26 (1 Jul 2025–30 Jun 2026)');
    expect(taxYearStartOf(d, 'BE-VLG')).toBe('01-01');   // a region follows its country
    expect(taxYearOf(d, 'GB', '2026-03-01').label).toBe('2025/26');
  });
});
