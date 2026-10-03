import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRestated, restatedRates, restatedReturns } from './restated.mjs';

const stored = [
  { index_code: 'MSCI_WORLD', year: 2024, basis: 'gross', currency: 'USD', total_return_pct: 19.19, source: 'factsheet 2026-08-31' },
  { index_code: 'MSCI_WORLD', year: 2025, basis: 'gross', currency: 'USD', total_return_pct: 21.6, source: 'factsheet 2026-08-31' },
];
const run = (values, extra = {}) => ({ returns: [{ index_code: 'MSCI_WORLD', basis: 'gross', currency: 'USD', source: 'factsheet 2027-01-31', values, ...extra }] });

test('a changed closed-year index return is restated, with the old and new value and both sources', () => {
  const r = restatedReturns(run({ 2024: 19.2, 2025: 21.6 }), stored);
  assert.equal(r.length, 1);
  assert.equal(r[0].what, 'MSCI_WORLD 2024 gross USD');
  assert.deepEqual(r[0].diffs, ['19.19 → 19.2']);
  assert.equal(r[0].oldSource, 'factsheet 2026-08-31');
  assert.equal(r[0].newSource, 'factsheet 2027-01-31');
});

test('a new year, a different currency, a different basis, or the same value is not a restatement', () => {
  assert.equal(restatedReturns(run({ 2023: 24.42 }), stored).length, 0);                    // nothing stored for 2023
  assert.equal(restatedReturns(run({ 2024: 19.19 }), stored).length, 0);                    // identical
  assert.equal(restatedReturns(run({ 2024: 20 }, { currency: 'EUR' }), stored).length, 0);   // another series
  assert.equal(restatedReturns(run({ 2024: 20 }, { basis: 'net' }), stored).length, 0);
  assert.equal(restatedReturns(run({ 2024: 20 }), undefined).length, 0);
  assert.equal(restatedReturns({}, stored).length, 0);
});

test('a derived row names its own working as the new source', () => {
  const r = restatedReturns(run({ 2024: 27 }, { currency: 'USD', source_by_year: { 2024: 'DERIVED: ...' } }), stored);
  assert.equal(r[0].newSource, 'DERIVED: ...');
});

const hist = [{ jurisdiction_code: 'NL', tax_type_code: 'WEALTH_NET', valid_from: '2024-01-01', valid_to: '2025-01-01', headline_rate: 1.9, rate_min: 1.9, rate_max: 1.9, threshold_amount: 57000, source_url: 'https://old.example/nl' }];
const rate = (extra) => ({ rates: [{ j: 'NL', t: 'WEALTH_NET', from: '2024-01-01', to: '2025-01-01', h: 1.9, thr: 57000, source_override: 'https://new.example/nl', ...extra }] });

test('a closed back-year row whose rate or threshold differs from the stored one is restated', () => {
  const r = restatedRates(rate({ h: 2.1, thr: 57684 }), hist);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].diffs, ['rate 1.9 → 2.1', 'minimum 1.9 → 2.1', 'maximum 1.9 → 2.1', 'threshold 57000 → 57684']);
  assert.equal(r[0].oldSource, 'https://old.example/nl');
  assert.equal(r[0].newSource, 'https://new.example/nl');
});

test('an identical row, a new row, and a current row that changes are not restatements', () => {
  assert.equal(restatedRates(rate({}), hist).length, 0);
  assert.equal(restatedRates(rate({ from: '2023-01-01', to: '2024-01-01', h: 5 }), hist).length, 0);       // nothing stored for 2023
  assert.equal(restatedRates({ rates: [{ j: 'NL', t: 'WEALTH_NET', from: '2024-01-01', h: 9 }] }, hist).length, 0);   // no "to": a current row, a new tax year
  assert.equal(restatedRates(rate({ thr: undefined }), [{ ...hist[0], threshold_amount: null }]).length, 0);     // unknown threshold on both sides
  assert.equal(restatedRates(rate({ thr: undefined }), hist).length, 1);                                         // a threshold that disappears IS a change
});

test('the lines for Hentus say plainly whether anything is restated', () => {
  assert.match(formatRestated([])[0], /^No stored value is restated/);
  const lines = formatRestated(restatedReturns(run({ 2024: 19.2 }), stored));
  assert.match(lines[0], /^RESTATED \(1\): .* Show Hentus before applying\./);
  assert.match(lines[1], /MSCI_WORLD 2024 gross USD: 19\.19 → 19\.2 .*factsheet 2026-08-31.*factsheet 2027-01-31/);
});
