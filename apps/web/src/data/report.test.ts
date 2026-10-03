import { describe, expect, it } from 'vitest';
import { buildReport, defaultStartYear, effectiveTax, fmtMoney, fmtUsd, perUnit, poss, PRINCIPAL, startYears, step, the, usdPer, type ReportOk } from './report';
import { FY, H, HISTORY_YEARS, J, P, R, base, longHistory, mk } from './report.testdata';

const ok = (r: ReturnType<typeof buildReport>): ReportOk => { if (!r.ok) throw new Error('expected ok, got: ' + r.text + JSON.stringify(r.missing)); return r; };

describe('one year, worked by hand (US$1,000,000, +10 %)', () => {
  const r = ok(buildReport(mk(), P()));
  it('kept at home: capital gains tax above the exemption, then the wealth taxes', () => {
    const y = r.years[0].home;
    expect(y.gain).toBeCloseTo(100_000, 6);
    expect(y.cgt).toBeCloseTo((100_000 - 10_000) * 0.30, 6);                  // EUR 9,000 exemption = US$10,000; 30 % = 27,000
    const v1 = 1_000_000 + 100_000 - 27_000;                                  // 1,073,000
    expect(y.wealth).toBeCloseTo(Math.max((v1 - 500_000) * 0.01, 0) + v1 * 0.002, 6);   // net wealth 5,730 + securities account 2,146
    expect(y.end).toBeCloseTo(v1 - 5_730 - 2_146, 6);                         // 1,065,124
    expect(y.fee).toBe(0);
  });
  it('through the trust: relieved taxes at the hub rate, the securities-account tax stays local, then the fee', () => {
    const y = r.years[0].trust;
    expect(y.cgt).toBe(0);
    const v1 = 1_100_000;
    expect(y.wealth).toBeCloseTo(v1 * 0.002, 6);                              // not relieved by a trust: still 0.2 % at home = 2,200
    expect(y.fee).toBeCloseTo((v1 - 2_200) * 0.005, 6);                       // 0.5 % of 1,097,800 = 5,489
    expect(y.end).toBeCloseTo(1_092_311, 6);
  });
  it('the difference, its share, and the split between tax and fee', () => {
    expect(r.difference).toBeCloseTo(1_092_311 - 1_065_124, 6);
    expect(r.differencePct).toBeCloseTo((27_187 / 1_065_124) * 100, 4);
    expect(r.home.tax).toBeCloseTo(27_000 + 7_876, 6);
    expect(r.trust).toMatchObject({ fee: expect.closeTo(5_489, 6) });
    expect(r.summary).toBe('If you had put US$1,000,000 into global shares at the start of 2024, by the end of 2024 you would have US$1,065,124 keeping it in XX, or US$1,092,311 through a Mauritius trust: ahead by US$27,187.');
  });
});

describe('several years', () => {
  const r = ok(buildReport(mk(), P({ endYear: 2025 })));
  it('each year starts where the last ended and uses the rate in force that year (capital gains 30 % → 25 % from 2025)', () => {
    expect(r.years.map((y) => y.year)).toEqual([2024, 2025]);
    expect(r.years[1].home.start).toBeCloseTo(r.years[0].home.end, 6);
    const s = r.years[0].home.end;
    expect(r.years[1].home.cgt).toBeCloseTo((s * 0.2 - 10_000) * 0.25, 6);
    expect(r.rates.filter((x) => x.side === 'home' && x.taxType === 'CGT_FINANCIAL').map((x) => [x.year, x.rate])).toEqual([[2024, 30], [2025, 25]]);
  });
  it('stops at the last year with an unbroken run of stored returns', () => {
    const d = mk({ market_returns: [R(2024, 10), R(2026, 5)] });
    expect(ok(buildReport(d, P({ endYear: undefined }))).endYear).toBe(2024);
  });
  it('lists the rows it used, with source, date, and the allowance in US$', () => {
    const net = r.rates.find((x) => x.side === 'home' && x.year === 2024 && x.taxType === 'WEALTH_NET')!;
    expect(net).toMatchObject({ rate: 1, thresholdLocal: 450000, currency: 'EUR', sourceUrl: 'https://src.example/XX/WEALTH_NET', verifiedOn: '2026-09-30', relieved: false });
    expect(net.thresholdConverted).toBeCloseTo(500_000, 6);
    expect(r.rates.find((x) => x.side === 'trust' && x.taxType === 'WEALTH_NET')).toMatchObject({ jurisdiction: 'MU', relieved: true, rate: 0 });
    expect(r.rates.find((x) => x.side === 'trust' && x.taxType === 'SECURITIES_ACCOUNT')).toMatchObject({ jurisdiction: 'XX', relieved: false, rate: 0.2 });
  });
});

describe('unknown stays unknown', () => {
  it('a missing home rate gives no comparison, never a zero', () => {
    const d = mk({ rate_history: base().rate_history.filter((x) => !(x.jurisdiction_code === 'XX' && x.tax_type_code === 'WEALTH_NET')) });
    const r = buildReport(d, P());
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe('data'); expect(r.missing.map((m) => m.text)).toEqual(['Net wealth for XX, 2024']); }
  });
  it("a hub row that starts after the hub's tax year began does not count for that year (Mauritius runs 1 Jul to 30 Jun)", () => {
    const rows = base().rate_history.map((x) => (x.jurisdiction_code === 'MU' && x.tax_type_code === 'CGT_FINANCIAL' ? { ...x, valid_from: '2024-08-01' } : x));
    const r = buildReport(mk({ rate_history: rows }), P());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.map((m) => m.text)).toEqual(['Capital gains for MU, 2024']);
    expect(buildReport(mk({ rate_history: rows.map((x) => (x.jurisdiction_code === 'MU' && x.tax_type_code === 'CGT_FINANCIAL' ? { ...x, valid_from: '2024-07-01' } : x)) }), P()).ok).toBe(true);
  });
  it('a threshold in a currency with no exchange rate for that year stops the report', () => {
    const r = buildReport(mk({ fx_history: [] }), P());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing[0]).toMatchObject({ kind: 'fx', who: 'EUR', year: 2024, text: 'exchange rate EUR→USD at the end of 2024' });
    expect(usdPer(mk({ fx: [] }), 'EUR')).toBeNull();
  });
  it("today's rate is never used in place of a year's: 2025 has no stored rate, so the report stops even though a current rate exists", () => {
    const r = buildReport(mk({ fx_history: [FY('USD', 2024, 0.9)] }), P({ endYear: 2025 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.map((x) => x.text)).toEqual(['exchange rate EUR→USD at the end of 2025']);
    expect(perUnit(mk(), 'EUR', 'USD')).toBeCloseTo(1 / 0.9, 10);            // a current rate IS stored
  });
  it('no index return for the start year', () => {
    const r = buildReport(mk({ market_returns: [R(2025, 20)] }), P());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing[0]).toMatchObject({ kind: 'return', year: 2024 });
  });
  it('start-year chips say which years cannot be built and why', () => {
    const chips = startYears(mk({ rate_history: base().rate_history.map((x) => (x.jurisdiction_code === 'XX' && x.valid_from === '2020-01-01' ? { ...x, valid_from: '2025-01-01' } : x)) }),
      { code: 'XX', structure: 'trust', hub: 'MU', principal: PRINCIPAL, feePct: 0.5, index: 'MSCI_WORLD' });
    expect(chips.map((c) => [c.year, c.ok])).toEqual([[2024, false], [2025, true]]);
    expect(chips[0].reason).toMatch(/Not enough stored data/);
  });
});

describe('regions and bases', () => {
  const regional = () => mk({
    jurisdictions: [...base().jurisdictions, J('YY', { regional_tax_types: ['WEALTH_NET'] }), J('YY-R', { kind: 'region', parent_code: 'YY' })],
    rate_history: [...base().rate_history, ...['CGT_FINANCIAL', 'WEALTH_SOLIDARITY', 'SECURITIES_ACCOUNT'].map((t) => H('YY', t, 10, '2020-01-01')), H('YY-R', 'WEALTH_NET', 2, '2020-01-01')],
  });
  it('a country that sets a modelled tax per region needs a region to be picked', () => {
    const r = buildReport(regional(), P({ code: 'YY' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('region');
    expect(buildReport(regional(), P({ code: 'YY-R' })).ok).toBe(true);
  });
  it('uses net returns when every year has them, otherwise gross for the whole run', () => {
    expect(ok(buildReport(mk({ market_returns: [R(2024, 10, 'gross'), R(2024, 9, 'net')] }), P())).basis).toBe('net');
    const mixed = ok(buildReport(mk({ market_returns: [R(2024, 10, 'gross'), R(2025, 20, 'gross'), R(2024, 9, 'net')] }), P({ endYear: 2025 })));
    expect(mixed.basis).toBe('gross');
    expect(mixed.years.map((y) => y.returnPct)).toEqual([10, 20]);
  });
  it('a euro index series is not used for a US-dollar report', () => {
    expect(buildReport(mk({ market_returns: [R(2024, 26.6, 'net', { currency: 'EUR' })] }), P()).ok).toBe(false);
  });
});

describe('flags', () => {
  it('lists, anti-offshore taxes, the CRS note, and rows still to verify', () => {
    const d = mk({ rate_history: [...base().rate_history, H('XX', 'FOREIGN_ASSET_TAX', 1.5, '2020-01-01'), H('XX', 'FOREIGN_PROPERTY', 0, '2020-01-01')] });
    const f = ok(buildReport(d, P())).flags;
    expect(f.find((x) => x.text.startsWith('Blacklist, Mauritius'))).toMatchObject({ level: 'green', sourceUrl: 'https://list.example' });
    expect(f.find((x) => x.text.startsWith('Trust recognition'))).toMatchObject({ level: 'red' });
    expect(f.find((x) => x.text.startsWith('Tax treaty'))).toMatchObject({ level: 'red' });
    expect(f.find((x) => x.text.startsWith('Foreign assets'))).toMatchObject({ level: 'red', text: 'Foreign assets: 1.5% in XX, charged on assets held abroad' });
    expect(f.some((x) => x.text.startsWith('Foreign property'))).toBe(false);          // 0 % is not a warning
    expect(f.find((x) => x.text.startsWith('Structures are reported'))).toMatchObject({ level: 'amber' });
    const v = ok(buildReport(mk({ rate_history: base().rate_history.map((x) => (x.tax_type_code === 'WEALTH_NET' && x.jurisdiction_code === 'XX' ? { ...x, needs_verification: true } : x)) }), P()));
    expect(v.toVerify).toEqual(['Net wealth (XX, 2024)']);
    expect(v.flags.some((x) => x.text.startsWith('Still to verify: Net wealth (XX, 2024)'))).toBe(true);
  });
});

describe('step, on its own', () => {
  const none = { rate: 0, thr: 0 };
  const t = { CGT_FINANCIAL: { rate: 0.3, thr: 10_000 }, WEALTH_NET: { rate: 0.01, thr: 500_000 }, WEALTH_SOLIDARITY: { rate: 0.02, thr: 800_000 }, SECURITIES_ACCOUNT: none };
  it('the larger of net-wealth and solidarity tax is charged, not both', () => {
    const y = step(1_000_000, 0, t, 0);
    expect(y.wealth).toBeCloseTo(Math.max(5_000, 4_000), 6);
  });
  it('a loss pays no capital gains tax', () => expect(step(1_000_000, -0.2, t, 0).cgt).toBe(0));
  it('the fee is charged on the value after tax, and only when asked', () => {
    expect(step(1_000_000, 0, { ...t, WEALTH_NET: none, WEALTH_SOLIDARITY: none }, 1).fee).toBeCloseTo(10_000, 6);
    expect(step(1_000_000, 0, { ...t, WEALTH_NET: none, WEALTH_SOLIDARITY: none }, 0).fee).toBe(0);
  });
  it('money is shown as US$ with thousands separators', () => expect(fmtUsd(1234567.6)).toBe('US$1,234,568'));
  it('names that take an article in running text', () => {
    expect([the('Netherlands'), the('United Kingdom'), the('France')]).toEqual(['the Netherlands', 'the United Kingdom', 'France']);
    expect([poss('the Netherlands'), poss('France')]).toEqual(["the Netherlands'", "France's"]);
  });
});

describe('the report in euros, US dollars or rand', () => {
  const zarFx = { currency: 'ZAR', eur_per_unit: 0.05, as_of: '2026-10-01', source_url: '' };      // 1 EUR = 20 ZAR
  const withFx = (extra: object[]) => ({ fx: [...base().fx, ...extra], fx_history: [...base().fx_history, FY('ZAR', 2024, 0.05), FY('ZAR', 2025, 0.05)] });
  it('rand: the principal, the allowances (EUR 9,000 = R180,000) and every amount are in rand', () => {
    const d = mk({ ...withFx([zarFx]), market_returns: [R(2024, 10, 'gross', { currency: 'ZAR' })] });
    const r = ok(buildReport(d, P({ currency: 'ZAR' })));
    expect(r.currency).toBe('ZAR');
    expect(r.years[0].home.start).toBe(1_000_000);
    expect(r.years[0].home.cgt).toBe(0);                                  // the R100,000 gain is under the R180,000 exemption
    expect(r.years[0].home.end).toBeCloseTo(1_100_000 - 2_200, 6);        // only the 0.2% securities-account tax
    expect(r.years[0].trust.end).toBeCloseTo(1_092_311, 6);               // the same trust path as the dollar example
    expect(r.rates.find((x) => x.side === 'home' && x.taxType === 'CGT_FINANCIAL')!.thresholdConverted).toBeCloseTo(180_000, 6);
    expect(r.rates.find((x) => x.side === 'home' && x.taxType === 'WEALTH_NET')!.thresholdConverted).toBeCloseTo(9_000_000, 6);
    expect(r.difference).toBeCloseTo(-5_489, 6);
    expect(r.summary).toBe('If you had put R1,000,000 into global shares at the start of 2024, by the end of 2024 you would have R1,097,800 keeping it in XX, or R1,092,311 through a Mauritius trust: behind by R5,489.');
  });
  it('euro: allowances already in euros are not converted', () => {
    const d = mk({ market_returns: [R(2024, 10, 'gross', { currency: 'EUR' })] });
    const r = ok(buildReport(d, P({ currency: 'EUR' })));
    const v1 = 1_000_000 + 100_000 - (100_000 - 9_000) * 0.3;               // exemption EUR 9,000, 30%
    expect(r.years[0].home.end).toBeCloseTo(v1 - (v1 - 450_000) * 0.01 - v1 * 0.002, 6);
    expect(r.summary).toMatch(/^If you had put €1,000,000 into global shares/);
    expect(r.rates.find((x) => x.side === 'home' && x.taxType === 'CGT_FINANCIAL')!.thresholdConverted).toBe(9000);
  });
  it('each currency uses only its own index series: no rows for it, no report', () => {
    const d = mk({ ...withFx([zarFx]), market_returns: [R(2024, 10, 'gross', { currency: 'EUR' })] });
    const r = buildReport(d, P({ currency: 'ZAR' }));
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.text).toMatch(/No index return in South African rand is stored for 2024/); expect(r.missing[0]).toMatchObject({ kind: 'return', text: 'index return in ZAR for 2024' }); }
    expect(startYears(d, { code: 'XX', structure: 'trust', hub: 'MU', principal: PRINCIPAL, feePct: 0.5, index: 'MSCI_WORLD', currency: 'ZAR' })).toEqual([]);
    expect(startYears(d, { code: 'XX', structure: 'trust', hub: 'MU', principal: PRINCIPAL, feePct: 0.5, index: 'MSCI_WORLD', currency: 'EUR' }).map((c) => c.year)).toEqual([2024]);
  });
  it('without an exchange rate into the report currency the allowances cannot be converted: stop', () => {
    const d = mk({ market_returns: [R(2024, 10, 'gross', { currency: 'ZAR' })] });                  // no ZAR rate in the dataset
    const r = buildReport(d, P({ currency: 'ZAR' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.map((x) => x.text)).toContain('exchange rate EUR→ZAR at the end of 2024');
  });
  it('euro and rand reports say the return includes the dollar\'s move; the dollar report does not', () => {
    const eur = ok(buildReport(mk({ market_returns: [R(2024, 10, 'gross', { currency: 'EUR' })] }), P({ currency: 'EUR' })));
    expect(eur.assumptions[0]).toMatch(/includes the move of the dollar against the euro/);
    expect(eur.assumptions[1]).toMatch(/^Valued in euros, before moves of any other currency/);
    const usd = ok(buildReport(mk(), P()));
    expect(usd.assumptions[0]).not.toMatch(/derived|worked out from the dollar/);
    expect(usd.assumptions[1]).toMatch(/^Valued in US dollars, before currency moves against your own currency/);
  });
  it('perUnit and fmtMoney', () => {
    expect(perUnit(mk(), 'EUR', 'USD')).toBeCloseTo(1 / 0.9, 10);
    expect(perUnit(mk(), 'USD', 'USD')).toBe(1);
    expect(perUnit(mk(), 'EUR', 'ZAR')).toBeNull();
    expect([fmtMoney(1234567.4, 'USD'), fmtMoney(1234567.5, 'EUR'), fmtMoney(1234567, 'ZAR'), fmtMoney(-5489.2, 'ZAR')]).toEqual(['US$1,234,567', '€1,234,568', 'R1,234,567', '−R5,489']);
  });
});

describe("each year's own exchange rate", () => {
  // The euro moves against the dollar: 1 EUR = US$1.111 at the end of 2024 (1 USD = 0.9 EUR) but US$1.25 at the end of 2025 (1 USD = 0.8 EUR).
  const moving = () => mk({ fx_history: [FY('USD', 2024, 0.9), FY('USD', 2025, 0.8)] });
  const r = ok(buildReport(moving(), P({ endYear: 2025 })));
  it('an allowance of EUR 9,000 is US$10,000 in 2024 and US$11,250 in 2025, not today\'s US$10,000 both times', () => {
    const cgt = (y: number) => r.rates.find((x) => x.side === 'home' && x.taxType === 'CGT_FINANCIAL' && x.year === y)!;
    expect(cgt(2024).thresholdConverted).toBeCloseTo(10_000, 6);
    expect(cgt(2025).thresholdConverted).toBeCloseTo(11_250, 6);
    const s = r.years[0].home.end;
    expect(r.years[1].home.cgt).toBeCloseTo((s * 0.2 - 11_250) * 0.25, 6);
  });
  it('lists the rates used, with the year, the source and the date, for the Excel', () => {
    expect(r.fxUsed.map((x) => [x.from, x.to, x.year])).toEqual([['EUR', 'USD', 2024], ['EUR', 'USD', 2025]]);
    expect(r.fxUsed[0].rate).toBeCloseTo(1 / 0.9, 10);
    expect(r.fxUsed[1].rate).toBeCloseTo(1.25, 10);
    expect(r.fxUsed[1]).toMatchObject({ sourceUrl: 'https://ecb.example/USD/2025', verifiedOn: '2026-10-03' });
  });
  it('a report that needs no conversion lists none, and says nothing about exchange rates', () => {
    const eur = ok(buildReport(mk({ market_returns: [R(2024, 10, 'gross', { currency: 'EUR' })], fx_history: [] }), P({ currency: 'EUR' })));
    expect(eur.fxUsed).toEqual([]);
    expect(eur.assumptions.join(' ')).not.toMatch(/Allowances set in another currency/);        // nothing was converted, so nothing is said about it
    expect(r.assumptions.join(' ')).toMatch(/ECB's reference rate at the end of each year/);
  });
  it('perUnit with a year reads only that year; EUR is always 1', () => {
    expect(perUnit(moving(), 'EUR', 'USD', 2025)).toBeCloseTo(1.25, 10);
    expect(perUnit(moving(), 'USD', 'EUR', 2024)).toBeCloseTo(0.9, 10);
    expect(perUnit(moving(), 'EUR', 'USD', 2023)).toBeNull();
    expect(perUnit(moving(), 'EUR', 'EUR', 2023)).toBe(1);
  });
});

describe('effective tax, and the parts of the bill', () => {
  const r = ok(buildReport(mk(), P()));
  it('is capital gains tax plus wealth taxes as a share of the starting value, with the trust fee left out', () => {
    expect(r.effective).toEqual([{ year: 2024, home: expect.closeTo(3.4876, 4), trust: expect.closeTo(0.22, 6) }]);   // (27,000 + 7,876) and 2,200 on 1,000,000
    expect(r.years[0].trust.fee).toBeGreaterThan(5_000);                                                               // a real fee, and not in the figure above
    expect(effectiveTax({ start: 0, gain: 0, cgt: 5, wealth: 5, wealthTax: 5, wealthKind: 'net', secTax: 0, fee: 0, end: 0 })).toBe(0);
  });
  it('splits the wealth bill into the larger of net-wealth and solidarity tax, and the securities-account tax', () => {
    expect(r.years[0].home).toMatchObject({ wealthKind: 'net', wealthTax: expect.closeTo(5_730, 6), secTax: expect.closeTo(2_146, 6) });
    expect(r.years[0].home.wealth).toBeCloseTo(5_730 + 2_146, 6);
    expect(r.years[0].trust).toMatchObject({ wealthKind: null, wealthTax: 0, secTax: expect.closeTo(2_200, 6) });
    const t = { CGT_FINANCIAL: { rate: 0, thr: 0 }, WEALTH_NET: { rate: 0.01, thr: 0 }, WEALTH_SOLIDARITY: { rate: 0.02, thr: 0 }, SECURITIES_ACCOUNT: { rate: 0, thr: 0 } };
    expect(step(1_000_000, 0, t, 0)).toMatchObject({ wealthKind: 'solidarity', wealthTax: 20_000 });
  });
});

describe('a ten-year history in euros (2015 to 2025)', () => {
  const yrs = HISTORY_YEARS;
  const r = ok(buildReport(longHistory(), P({ startYear: 2015, endYear: 2025, currency: 'EUR' })));
  it('runs eleven years, each starting where the last ended, with the rate in force that year', () => {
    expect(r.years.map((y) => y.year)).toEqual(yrs);
    r.years.slice(1).forEach((y, i) => { expect(y.home.start).toBeCloseTo(r.years[i].home.end, 6); expect(y.trust.start).toBeCloseTo(r.years[i].trust.end, 6); });
    const cgt = r.rates.filter((x) => x.side === 'home' && x.taxType === 'CGT_FINANCIAL').map((x) => [x.year, x.rate]);
    expect(cgt.filter(([y]) => y < 2020).every(([, rate]) => rate === 20)).toBe(true);
    expect(cgt.filter(([y]) => y >= 2020).every(([, rate]) => rate === 26)).toBe(true);
    expect(r.fxUsed).toEqual([]);
  });
  it('worked by hand: 2015 pays 19,800 of capital gains tax and 4,901 of wealth tax; the -5 % year of 2016 pays no capital gains tax', () => {
    const y = r.years[0].home;
    expect(y.cgt).toBeCloseTo((100_000 - 1_000) * 0.2, 6);                       // 19,800
    expect(y.wealth).toBeCloseTo((1_000_000 + 100_000 - 19_800 - 100_000) * 0.005, 6);   // 4,901
    expect(y.end).toBeCloseTo(1_075_299, 6);
    const l = r.years[1].home;
    expect(l.cgt).toBe(0);
    expect(l.wealth).toBeCloseTo((1_075_299 * 0.95 - 100_000) * 0.005, 6);
    expect(r.effective[1].home).toBeCloseTo(((1_075_299 * 0.95 - 100_000) * 0.005) / 1_075_299 * 100, 6);
  });
  it('the effective tax of the trust column stays at the hub rates (0 %) while the local one carries the tax', () => {
    expect(r.effective).toHaveLength(11);
    expect(r.effective[0].home).toBeCloseTo(((19_800 + 4_901) / 1_000_000) * 100, 6);
    expect(r.effective.every((e) => e.trust === 0)).toBe(true);
    expect(r.effective.every((e) => e.home > 0)).toBe(true);
  });
});

describe('the window a report opens on', () => {
  const chips = (from: number, to: number, firstOk: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ year: from + i, ok: from + i >= firstOk }));
  it('is the last ten years: with data back to 2015 and the last year 2025, it opens on 2015', () => expect(defaultStartYear(chips(2015, 2025, 2015))).toBe(2015));
  it('moves by itself: once 2026 has closed it opens on 2016', () => expect(defaultStartYear(chips(2015, 2026, 2015))).toBe(2016));
  it('never reaches back further than the ten years, even when older years can be built', () => expect(defaultStartYear(chips(2012, 2025, 2012))).toBe(2015));
  it('opens on the earliest year that can be built when the data starts later', () => expect(defaultStartYear(chips(2015, 2025, 2024))).toBe(2024));
  it('is null when nothing can be built', () => { expect(defaultStartYear(chips(2015, 2025, 2030))).toBeNull(); expect(defaultStartYear([])).toBeNull(); });
});
