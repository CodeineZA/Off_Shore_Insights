import { describe, expect, it } from 'vitest';
import { buildReport, type ReportOk } from './report';
import { P, R, mk } from './report.testdata';
import { reportSheets } from './reportsheets';
import { buildWorkbook, toBase64 } from './reportxlsx';
import { sourcesForReport } from './sources';

const d = mk();
const r = buildReport(d, P({ endYear: 2025 })) as ReportOk;
const meta = { generatedOn: '2026-10-02', dataAsOf: '2026-10-02' };
const sheets = reportSheets(d, r, meta);
const by = (n: string) => sheets.find((s) => s.name === n)!;

describe('the raw-value sheets', () => {
  it('eight sheets (the exchange-rate sheet because an allowance was converted), each row as wide as its columns', () => {
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'Yearly', 'Rates used', 'FX used', 'Index returns', 'Flags', 'Assumptions', 'Sources']);
    for (const s of sheets) for (const row of s.rows) expect(row.length, s.name).toBe(s.columns.length);
  });
  it('a report that converted nothing has no exchange-rate sheet', () => {
    const eur = buildReport(mk({ market_returns: [R(2024, 10, 'gross', { currency: 'EUR' })], fx_history: [] }), P({ currency: 'EUR' })) as ReportOk;
    expect(reportSheets(mk(), eur, meta).map((s) => s.name)).not.toContain('FX used');
  });
  it('lists every exchange rate used, with the year, the rate and where it came from', () => {
    expect(by('FX used').rows).toEqual([['EUR', 'USD', 2024, expect.closeTo(1 / 0.9, 10), 'https://ecb.example/USD/2024', '2026-10-03'], ['EUR', 'USD', 2025, expect.closeTo(1 / 0.9, 10), 'https://ecb.example/USD/2025', '2026-10-03']]);
  });
  it('the yearly sheet carries the effective tax and the parts of the wealth bill, to the same numbers as the report', () => {
    const y = by('Yearly');
    expect(y.columns.slice(14).map((c) => c.header)).toEqual(expect.arrayContaining(['Home: effective tax % of start value', 'Trust: effective tax % of start value']));
    expect(y.rows[0][14]).toBe(Number(r.effective[0].home.toFixed(4)));
    expect(y.rows[0][15]).toBe(Number(r.effective[0].trust.toFixed(4)));
    expect(y.rows[0][16]).toBe(Math.round(r.years[0].home.wealthTax));
    expect(y.rows[0][17]).toBe(Math.round(r.years[0].home.secTax));
    expect(Number(y.rows[0][16]) + Number(y.rows[0][17])).toBe(Math.round(r.years[0].home.wealth));
  });
  it('the summary carries the same totals the screen shows', () => {
    const v = Object.fromEntries(by('Summary').rows.map(([k, x]) => [k, x]));
    expect(v['Value at end 2025, kept in XX (USD)']).toBe(Math.round(r.home.end));
    expect(v['Value at end 2025, through the Mauritius trust (USD)']).toBe(Math.round(r.trust.end));
    expect(v['Difference (USD)']).toBe(Math.round(r.difference));
    expect(v['Currency']).toBe('USD (US dollars)');
    expect(v['Trust fee (% of value a year)']).toBe(0.5);
    expect(v['Statement']).toBe(r.summary);
  });
  it('one yearly row per year, and the difference column is trust minus home', () => {
    const y = by('Yearly').rows;
    expect(y.map((x) => x[0])).toEqual([2024, 2025]);
    expect(y[1][13]).toBe(Math.round(r.years[1].trust.end - r.years[1].home.end));
    expect(y[0][6]).toBe(Math.round(r.years[0].home.end));
  });
  it('every rate row used is listed with its source, date, allowance in both currencies, and which side it belongs to', () => {
    const rows = by('Rates used').rows;
    expect(rows).toHaveLength(r.rates.length);
    const net = rows.find((x) => x[0] === 'Home' && x[1] === 2024 && x[2] === 'Net wealth')!;
    expect(net.slice(3)).toEqual(expect.arrayContaining(['XX', 'No', 1, 450000, 'EUR', 500000, 'https://src.example/XX/WEALTH_NET', '2026-09-30']));
    expect(rows.find((x) => x[0] === 'Trust' && x[2] === 'Net wealth')![3]).toBe('MU');
  });
  it('the index returns and the sources are there; nothing is NaN or undefined', () => {
    expect(by('Index returns').rows.map((x) => [x[0], x[4]])).toEqual([[2024, 10], [2025, 20]]);
    expect(by('Sources').rows.some((x) => x[3] === 'https://msci.example')).toBe(true);
    for (const s of sheets) for (const row of s.rows) for (const c of row) expect(c === undefined || (typeof c === 'number' && !Number.isFinite(c))).toBe(false);
    expect(sourcesForReport(d, r).map((g) => g.id)).toEqual(['rates', 'lists', 'returns']);
  });
});

describe('the .xlsx file', () => {
  it('opens again with the same sheets, numbers as numbers, and a frozen header row', async () => {
    const bytes = await buildWorkbook(sheets, 'test');
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]);                      // a zip: "PK"
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(sheets.map((s) => s.name));
    const y = wb.getWorksheet('Yearly')!;
    expect(y.getRow(1).getCell(1).value).toBe('Year');
    expect(y.getRow(2).getCell(7).value).toBe(Math.round(r.years[0].home.end));
    expect(typeof y.getRow(2).getCell(7).value).toBe('number');
    expect(y.getRow(2).getCell(7).numFmt).toBe('#,##0');
    expect(y.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(toBase64(bytes.slice(0, 3)).length).toBe(4);
  });
});
