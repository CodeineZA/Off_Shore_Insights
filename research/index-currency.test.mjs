// node --test research/index-currency.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertReturn, lastOnOrBefore, parseEcbCsv, unitsPerUsd } from './index-currency.mjs';

test('euro investor: the dollar fell against the euro, so the euro return is higher than the dollar return', () => {
  // 29 Dec 2023: 1.1050 USD per EUR; 31 Dec 2024: 1.0389. 19.19% in dollars.
  const r = convertReturn(19.19, { USD: 1.105, ZAR: 20.0 }, { USD: 1.0389, ZAR: 19.0 }, 'EUR');
  assert.equal(r, Math.round(((1.1919 * 1.105) / 1.0389 - 1) * 10000) / 100);     // 26.77
  assert.equal(r, 26.77);
});

test('rand investor: units of rand per dollar, end over start', () => {
  // 20.4/1.1 = 18.545 rand per dollar at the start; 19.0/1.05 = 18.095 at the end: the rand strengthened, so the rand return is lower
  const r = convertReturn(10, { USD: 1.1, ZAR: 20.4 }, { USD: 1.05, ZAR: 19.0 }, 'ZAR');
  assert.equal(r, Math.round((1.1 * (19.0 / 1.05 / (20.4 / 1.1)) - 1) * 10000) / 100);
  assert.ok(r < 10);
});

test('a currency that did not move against the dollar leaves the return as it was; one that moved does not', () => {
  assert.equal(convertReturn(12.34, { USD: 1.1, ZAR: 20 }, { USD: 1.1, ZAR: 20 }, 'ZAR'), 12.34);
  assert.notEqual(convertReturn(12.34, { USD: 1.1 }, { USD: 1.2 }, 'EUR'), 12.34);
  assert.equal(unitsPerUsd({ USD: 1.25 }, 'EUR'), 0.8);       // 1 USD = 0.8 EUR when 1 EUR = 1.25 USD
});

test('a loss in dollars stays a loss unless the currency move outweighs it', () => {
  assert.ok(convertReturn(-10, { USD: 1.1 }, { USD: 1.1 }, 'EUR') === -10);
  assert.ok(convertReturn(-10, { USD: 1.2 }, { USD: 1.0 }, 'EUR') > 0);
});

test('the rate used is the last one published on or before the date', () => {
  const obs = [{ date: '2023-12-28', value: 1.1114 }, { date: '2023-12-29', value: 1.105 }, { date: '2024-01-02', value: 1.0956 }];
  assert.deepEqual(lastOnOrBefore(obs, '2023-12-31'), { date: '2023-12-29', value: 1.105 });
  assert.deepEqual(lastOnOrBefore(obs, '2023-12-29'), { date: '2023-12-29', value: 1.105 });
  assert.equal(lastOnOrBefore(obs, '2023-12-01'), null);
});

test('the ECB csv is read by column name; blanks and zeros are skipped', () => {
  const csv = 'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS\n'
    + 'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2023-12-29,1.105,A\nEXR.D.ZAR.EUR.SP00.A,D,ZAR,EUR,SP00,A,2023-12-29,20.4,A\nEXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2024-01-01,,A\n';
  assert.deepEqual(parseEcbCsv(csv), { USD: [{ date: '2023-12-29', value: 1.105 }], ZAR: [{ date: '2023-12-29', value: 20.4 }] });
  assert.throws(() => parseEcbCsv('a,b\n1,2'), /unexpected ECB csv header/);
});
