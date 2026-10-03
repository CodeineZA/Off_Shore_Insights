import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEcbCsv } from './index-currency.mjs';
import { FX_CURRENCIES, ecbUrl, fxYearSql, restatedFx, yearEndRates } from './fx-years.mjs';

const csv = (rows) => ['KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE', ...rows.map(([c, d, v]) => `EXR.D.${c}.EUR.SP00.A,D,${c},EUR,SP00,A,${d},${v}`)].join('\n');
const obs = parseEcbCsv(csv([
  ['USD', '2015-12-30', 1.0950], ['USD', '2015-12-31', 1.0887],
  ['USD', '2016-12-29', 1.0541], ['USD', '2016-12-30', 1.0541],                       // no 31 December published: the 30th is the year end
  ['GBP', '2015-12-31', 0.73395], ['GBP', '2016-12-30', 0.85618],
  ['ZAR', '2015-12-31', 16.9530],                                                       // 2016 is missing for the rand
  ['CHF', '2015-12-04', 1.0850], ['CHF', '2016-12-30', 1.0739],                         // 2015: last fixing is from early December, not the year end
]));

test('takes the last rate published on or before 31 December, and turns it into euros per unit', () => {
  const { rows } = yearEndRates(obs, ['USD', 'GBP'], [2015, 2016]);
  const usd15 = rows.find((r) => r.currency === 'USD' && r.year === 2015);
  assert.equal(usd15.date, '2015-12-31');
  assert.equal(usd15.perEur, 1.0887);
  assert.equal(usd15.eurPerUnit, Math.round((1 / 1.0887) * 1e8) / 1e8);
  assert.equal(rows.find((r) => r.currency === 'USD' && r.year === 2016).date, '2016-12-30');
  assert.equal(rows.length, 4);
});

test('a year with no rate near its end is missing, never carried over from another year', () => {
  const { rows, missing } = yearEndRates(obs, ['ZAR', 'CHF'], [2015, 2016]);
  assert.deepEqual(missing, [{ currency: 'ZAR', year: 2016 }, { currency: 'CHF', year: 2015 }]);
  assert.deepEqual(rows.map((r) => `${r.currency}${r.year}`), ['ZAR2015', 'CHF2016']);
  assert.equal(yearEndRates({}, ['USD'], [2015]).missing.length, 1);                      // a currency the ECB returned nothing for
});

test('writes idempotent SQL with the source text, the address and the date, and escapes quotes', () => {
  const { rows } = yearEndRates(obs, ['USD'], [2015]);
  const sql = fxYearSql(rows, { today: '2026-10-03' });
  assert.match(sql, /insert into fx_rate_year \(currency, year, eur_per_unit, source, source_url, verified_on\) values \('USD', 2015, 0\.9185/);
  assert.match(sql, /ECB euro foreign exchange reference rate of 2015-12-31: 1 EUR = 1\.0887 USD/);
  assert.ok(sql.includes(ecbUrl('USD')));
  assert.match(sql, /on conflict \(currency, year\) do update set eur_per_unit = excluded\.eur_per_unit/);
  assert.match(sql, /'2026-10-03'\)/);
  assert.ok(!/ZAR|GBP/.test(sql));                                                        // only the rows given
  assert.match(fxYearSql([{ ...rows[0], currency: "O'B" }], { today: '2026-10-03' }), /'O''B'/);
});

test('shows a stored year-end rate that a new run would change (the newest edition wins, but visibly)', () => {
  const { rows } = yearEndRates(obs, ['USD'], [2015, 2016]);
  const stored = [{ currency: 'USD', year: 2015, eur_per_unit: rows[0].eurPerUnit, source: 'ECB' }, { currency: 'USD', year: 2016, eur_per_unit: 0.9, source: 'old edition' }];
  const r = restatedFx(rows, stored);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].currency, r[0].year, r[0].old], ['USD', 2016, 0.9]);
  assert.equal(restatedFx(rows, []).length, 0);                                           // nothing stored: nothing restated
  assert.equal(restatedFx(rows, undefined).length, 0);
});

test('the currencies to fetch are the report and home currencies the ECB publishes', () => {
  assert.deepEqual(FX_CURRENCIES, ['USD', 'GBP', 'CHF', 'ZAR']);
});
