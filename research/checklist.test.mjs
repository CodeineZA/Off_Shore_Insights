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
  d.wealth = [{ jurisdiction_code: 'XX', year: 2025, millionaires: 1, uhnwi_count: 1, business_owners: 1, trusts_count: 1 }, { jurisdiction_code: 'XX', year: 2024, millionaires: 1, uhnwi_count: 1 }];
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

test('money back years are not requested: an older report edition is a different, restated series', () => {
  const items = buildChecklist(empty([J('XX')]), '2026-10-02');
  assert.equal(items.some((i) => i.item.startsWith('history_wealth')), false);
});

// ── the ten-year report: four taxes for every year of its window ──
import { REPORT_TAXES, REPORT_SPAN, ranges } from './checklist.mjs';
const withReportTaxes = (jurisdictions) => ({ ...empty(jurisdictions), tax_types: [...REPORT_TAXES.map((c) => T(c, c.replace(/_/g, ' '))), T('INH')] });
// a row covering the tax year that begins in `y` (calendar year), for every tax, from `y` to `to` (exclusive)
const rows = (j, from, to, taxes = REPORT_TAXES, md = '01-01') => taxes.flatMap((t) => Array.from({ length: to - from }, (_, i) => R(j, t, { valid_from: `${from + i}-${md}`, valid_to: `${from + i + 1}-${md}` })));
const item = (items, code) => items.find((i) => i.item === 'report:history' && i.jurisdiction_code === code);

test('report history: the window is the last closed year and the ten before it, and the item says which years are missing', () => {
  const d = withReportTaxes([J('XX')]);
  d.rate_history = rows('XX', 2024, 2026);                                       // only 2024 and 2025 on file
  const it = item(buildChecklist(d, '2026-10-03'), 'XX');
  assert.equal(it.status, 'missing');
  assert.equal(it.detail, '2015 to 2025: 8 of 44 cells on file; missing for 2015 to 2023');
  assert.match(it.where_to_get, /Back-year run for XX: .* for 2015 to 2023\. Newest edition that states the year/);
  assert.equal(REPORT_SPAN, 10);
});

test('report history: complete when every cell is on file, and the window moves by itself when a year closes', () => {
  const d = withReportTaxes([J('XX')]);
  d.rate_history = rows('XX', 2015, 2026);
  assert.deepEqual([item(buildChecklist(d, '2026-10-03'), 'XX').status, item(buildChecklist(d, '2026-10-03'), 'XX').detail], ['have', '2015 to 2025: all 44 cells on file']);
  const next = item(buildChecklist(d, '2027-02-01'), 'XX');                       // 2026 has closed: the window is 2016 to 2026, and 2026 has no row yet
  assert.equal(next.status, 'missing');
  assert.equal(next.detail, '2016 to 2026: 40 of 44 cells on file; missing for 2026');
});

test('report history: one tax missing in one year is a gap, and ranges are written compactly', () => {
  const d = withReportTaxes([J('XX')]);
  d.rate_history = [...rows('XX', 2015, 2026, REPORT_TAXES.filter((t) => t !== 'WEALTH_NET')), ...rows('XX', 2015, 2026, ['WEALTH_NET']).filter((r) => r.valid_from !== '2018-01-01' && r.valid_from !== '2022-01-01' && r.valid_from !== '2023-01-01')];
  const it = item(buildChecklist(d, '2026-10-03'), 'XX');
  assert.equal(it.detail, '2015 to 2025: 41 of 44 cells on file; missing for 2018, 2022 to 2023');
  assert.equal(ranges([2015, 2016, 2017, 2019, 2021, 2022]), '2015 to 2017, 2019, 2021 to 2022');
  assert.equal(ranges([]), '');
});

test('report history: a tax year that does not start on 1 January is judged on its own first day (a 6 April or 1 July year)', () => {
  const d = withReportTaxes([J('GB', { tax_year_start: '04-06' }), J('MU', { is_offshore_hub: true, tax_year_start: '07-01' })]);
  d.rate_history = [...rows('GB', 2015, 2026, REPORT_TAXES, '04-06'), ...rows('MU', 2015, 2026, REPORT_TAXES, '07-01')];
  const items = buildChecklist(d, '2026-10-03');
  assert.equal(item(items, 'GB').status, 'have');
  assert.equal(item(items, 'MU').status, 'have');                                 // hubs are part of the report too
  d.rate_history = rows('GB', 2015, 2026, REPORT_TAXES, '01-01');                 // rows running 1 January to 1 January also cover 6 April of each year
  assert.equal(item(buildChecklist(d, '2026-10-03'), 'GB').status, 'have');
  d.rate_history = rows('GB', 2015, 2026, REPORT_TAXES, '07-01');                 // rows running 1 July to 1 July do not cover 6 April 2015, the first day of the first tax year
  assert.equal(item(buildChecklist(d, '2026-10-03'), 'GB').status, 'missing');
});

test('report history: a tax a country sets per region is looked for in its regions, not at the national level', () => {
  const d = withReportTaxes([J('ES', { regional_tax_types: ['WEALTH_NET'] }), J('ES-MD', { kind: 'region', parent_code: 'ES' })]);
  d.rate_history = [...rows('ES', 2015, 2026, REPORT_TAXES.filter((t) => t !== 'WEALTH_NET'))];
  const items = buildChecklist(d, '2026-10-03');
  assert.equal(item(items, 'ES').status, 'have');                                 // 3 taxes x 11 years, all on file
  assert.equal(item(items, 'ES').detail, '2015 to 2025: all 33 cells on file');
  assert.equal(item(items, 'ES-MD').status, 'missing');                           // the region owns WEALTH_NET
  assert.equal(item(items, 'ES-MD').detail, '2015 to 2025: 0 of 11 cells on file; missing for 2015 to 2025');
});

test('report history: no item where the report taxes do not exist, and a blocked item stays blocked', () => {
  assert.equal(buildChecklist(empty([J('XX')]), '2026-10-03').some((i) => i.item === 'report:history'), false);
  const d = withReportTaxes([J('XX')]);
  d.research_items = [{ jurisdiction_code: 'XX', item: 'report:history', status: 'blocked', detail: 'No source states 2015 to 2017', where_to_get: 'Ask the tax office' }];
  const it = item(buildChecklist(d, '2026-10-03'), 'XX');
  assert.deepEqual([it.status, it.detail, it.where_to_get], ['blocked', 'No source states 2015 to 2017', 'Ask the tax office']);
});
