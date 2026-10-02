// node --test research/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChecklist, checklistSql, taxYear, taxYearByStartYear } from './checklist.mjs';

const T = (code, label = code) => ({ code, label, category: 'estate', applies_to: ['individual'], is_recurring: false, sort_order: 1 });
const J = (code, extra = {}) => ({ code, name: code, parent_code: null, kind: 'country', is_offshore_hub: false, tax_year_start: '01-01',
  regional_tax_types: [], structure_checked_on: null, structure_note: null, ...extra });
const R = (j, t, extra = {}) => ({ jurisdiction_code: j, tax_type_code: t, headline_rate: 10, valid_from: '2026-01-01', valid_to: null,
  verified_on: '2026-09-30', needs_verification: false, ...extra });
const empty = (jurisdictions) => ({ jurisdictions, tax_types: [T('INH'), T('CGT')], rate_history: [], treaties: [], gates: [], wealth: [], advisors: [], research_items: [] });
const status = (items, item, code) => items.find((i) => i.item === item && (!code || i.jurisdiction_code === code))?.status;

test('tax years: calendar, 6 April, 1 July and 1 March years, and their labels', () => {
  assert.deepEqual(taxYear('01-01', '2026-10-02'), { startYear: 2026, start: '2026-01-01', end: '2026-12-31', label: '2026' });
  assert.deepEqual(taxYear('04-06', '2026-04-05'), { startYear: 2025, start: '2025-04-06', end: '2026-04-05', label: '2025/26' });
  assert.equal(taxYear('04-06', '2026-04-06').label, '2026/27');
  assert.deepEqual(taxYear('07-01', '2026-06-30'), { startYear: 2025, start: '2025-07-01', end: '2026-06-30', label: '2025/26' });
  assert.equal(taxYearByStartYear('03-01', 2027).end, '2028-02-29');   // leap year end of a 1 March year
  assert.equal(taxYear(undefined, '2026-02-01').label, '2026');         // no start recorded → calendar year
});

test('an empty country has every item missing; nothing is reported as present', () => {
  const items = buildChecklist(empty([J('XX')]), '2026-10-02');
  assert.ok(items.length >= 12);
  assert.deepEqual([...new Set(items.map((i) => i.status))], ['missing']);
  for (const k of ['structure', 'tax:INH', 'tax:CGT', 'treaty:MU', 'treaty:SC', 'gate:blacklist:MU', 'gate:blacklist:SC', 'gate:trust_recognition',
    'wealth:millionaires', 'wealth:uhnwi_count', 'wealth:business_owners', 'wealth:trusts_count', 'advisors']) assert.equal(status(items, k), 'missing', k);
  assert.ok(items.every((i) => i.where_to_get), 'each missing item says where to get it');
});

test('a complete country has everything in place', () => {
  const d = empty([J('XX', { structure_checked_on: '2026-09-30', structure_note: 'One national regime' })]);
  d.rate_history = ['INH', 'CGT'].flatMap((t) => [R('XX', t), R('XX', t, { valid_from: '2025-01-01', valid_to: '2026-01-01' }), R('XX', t, { valid_from: '2024-01-01', valid_to: '2025-01-01' })]);
  d.treaties = ['MU', 'SC'].map((h) => ({ country_a: h, country_b: 'XX', status: 'in_force', signed_on: '2000-01-01', in_force_on: '2001-01-01' }));
  d.gates = [{ jurisdiction_code: 'XX', hub: 'MU', gate: 'blacklist', label: 'Not listed' }, { jurisdiction_code: 'XX', hub: 'SC', gate: 'blacklist', label: 'Not listed' },
    { jurisdiction_code: 'XX', hub: null, gate: 'trust_recognition', label: 'Party' }];
  d.wealth = [{ jurisdiction_code: 'XX', year: 2025, millionaires: 1, uhnwi_count: 1, business_owners: 1, trusts_count: 1 }];
  d.advisors = [{ country_code: 'XX' }];
  const items = buildChecklist(d, '2026-10-02');
  assert.deepEqual(items.filter((i) => i.status !== 'have'), []);
  assert.equal(status(items, 'history:2025'), 'have');
  assert.equal(status(items, 'history:2024'), 'have');
});

test('a back year is missing until every tax we hold has a figure covering that tax year', () => {
  const d = empty([J('XX')]);
  d.rate_history = [R('XX', 'INH'), R('XX', 'CGT'), R('XX', 'INH', { valid_from: '2025-01-01', valid_to: '2026-01-01' })];   // CGT 2025 missing
  const items = buildChecklist(d, '2026-10-02');
  assert.equal(status(items, 'history:2025'), 'missing');
  assert.match(items.find((i) => i.item === 'history:2025').detail, /1 of 2 taxes/);
});

test('stale: a rate last verified before this tax year began; a 6 April year is judged on its own dates', () => {
  const d = empty([J('XX'), J('GB', { tax_year_start: '04-06' })]);
  d.rate_history = [R('XX', 'INH', { verified_on: '2025-12-31' }), R('XX', 'CGT', { verified_on: '2026-01-01' }),
    R('GB', 'INH', { verified_on: '2026-04-05' }), R('GB', 'CGT', { verified_on: '2026-04-06' })];
  const items = buildChecklist(d, '2026-10-02');
  assert.equal(status(items, 'tax:INH', 'XX'), 'stale');   // before 1 Jan 2026
  assert.equal(status(items, 'tax:CGT', 'XX'), 'have');
  assert.equal(status(items, 'tax:INH', 'GB'), 'stale');   // before 6 Apr 2026
  assert.equal(status(items, 'tax:CGT', 'GB'), 'have');
  assert.match(items.find((i) => i.item === 'tax:INH' && i.jurisdiction_code === 'GB').detail, /2026\/27/);
});

test('a region is checked only for the taxes its country sets per region, plus regional money', () => {
  const d = empty([J('BE', { regional_tax_types: ['INH'] }), J('BE-VLG', { kind: 'region', parent_code: 'BE' })]);
  d.rate_history = [R('BE', 'CGT'), R('BE-VLG', 'INH')];
  const items = buildChecklist(d, '2026-10-02');
  const region = items.filter((i) => i.jurisdiction_code === 'BE-VLG').map((i) => i.item).sort();
  assert.deepEqual(region.filter((i) => !i.startsWith('history')), ['tax:INH', 'wealth:regional']);
  assert.equal(status(items, 'tax:INH', 'BE'), 'have');   // national level has none by design
  assert.match(items.find((i) => i.item === 'tax:INH' && i.jurisdiction_code === 'BE').detail, /regions/);
  assert.equal(status(items, 'wealth:regional', 'BE-VLG'), 'missing');
  assert.equal(status(items, 'treaty:MU', 'BE-VLG'), undefined, 'treaty and gates belong to the country');
});

test('hubs are checked for their tax rates only', () => {
  const items = buildChecklist(empty([J('MU', { is_offshore_hub: true })]), '2026-10-02');
  assert.deepEqual(items.map((i) => i.item).sort(), ['tax:CGT', 'tax:INH']);
});

test('treaty dates: in force without a date is missing; with the date it is in place; no treaty needs no date', () => {
  const d = empty([J('XX'), J('YY')]);
  d.treaties = [{ country_a: 'MU', country_b: 'XX', status: 'in_force', in_force_on: null }, { country_a: 'SC', country_b: 'XX', status: 'in_force', in_force_on: '2001-01-01' },
    { country_a: 'MU', country_b: 'YY', status: 'none' }];
  const items = buildChecklist(d, '2026-10-02');
  assert.equal(status(items, 'treaty_dates:MU', 'XX'), 'missing');
  assert.equal(status(items, 'treaty_dates:SC', 'XX'), 'have');
  assert.equal(status(items, 'treaty_dates:MU', 'YY'), undefined);
  assert.equal(status(items, 'treaty:MU', 'YY'), 'have');   // "none" is an answer, not a gap
});

test('blocked is sticky while the figure is still absent, and ends once it is present', () => {
  const d = empty([J('XX')]);
  d.research_items = [{ jurisdiction_code: 'XX', item: 'wealth:uhnwi_count', status: 'blocked', detail: 'Not in the table', where_to_get: 'Ask Knight Frank' }];
  let it = buildChecklist(d, '2026-10-02').find((i) => i.item === 'wealth:uhnwi_count');
  assert.deepEqual([it.status, it.detail, it.where_to_get], ['blocked', 'Not in the table', 'Ask Knight Frank']);
  d.wealth = [{ jurisdiction_code: 'XX', year: 2026, uhnwi_count: 5 }];
  it = buildChecklist(d, '2026-10-02').find((i) => i.item === 'wealth:uhnwi_count');
  assert.equal(it.status, 'have');
});

test('checklistSql upserts each item, escapes quotes, and removes rows no longer on the list', () => {
  const sql = checklistSql([{ jurisdiction_code: 'XX', item: 'treaty:MU', status: 'missing', detail: "it's unknown", where_to_get: null }], '2026-10-02', ['XX']);
  assert.match(sql, /'it''s unknown'/);
  assert.match(sql, /on conflict \(jurisdiction_code, item\) do update/);
  assert.match(sql, /delete from research_item where jurisdiction_code = 'XX' and item <> all \(array\['treaty:MU'\]\)/);
});
