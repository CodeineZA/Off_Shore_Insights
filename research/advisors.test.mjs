// node --test research/advisors.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advisorsSql, completeness, REQUIRED_FOR_SCRAPEABLE } from './advisors-lib.mjs';

const known = { categories: new Set(['law_firm', 'real_estate']), taxTypes: new Set(['INHERITANCE_DIRECT', 'CGT_FINANCIAL']), services: new Set(['trust']), sourceUrls: new Set() };
const source = { name: 'NOvA directory', scope: 'country:NL', country: 'NL', list_url: 'https://example.invalid/advocaten', kind: 'directory', collection: 'claude', access: 'open', fields_present: ['name', 'city'] };
const firm = (extra = {}) => ({ name: 'Van Dijk & Partners', registered_name: 'Van Dijk & Partners B.V.', category: 'law_firm', country: 'NL', city: 'Amsterdam',
  phone: '+31 20 000 0000', website: 'https://vandijk.example', tax_topics: ['INHERITANCE_DIRECT'], services: ['trust'], collected_by: 'claude', source: source.list_url,
  source_url: 'https://example.invalid/advocaten/vandijk', found_via: 'Chambers 2026 Private Wealth, Band 1', ...extra });
const run = (extra = {}) => ({ run: '2026-10-05', sources: [source], advisors: [firm()], ...extra });

test('a valid run becomes upserts for the source and the firm, linked by the source url', () => {
  const { sql, errors, counts } = advisorsSql(run(), known);
  assert.deepEqual(errors, []);
  assert.deepEqual(counts, { categories: 0, sources: 1, advisors: 1 });
  assert.match(sql, /insert into advisor_source .* on conflict \(list_url\) do update/s);
  assert.match(sql, /insert into advisor .* on conflict \(country_code, lower\(coalesce\(registered_name, name\)\), coalesce\(lower\(city\), ''\)\) do update/s);
  assert.match(sql, /\(select id from advisor_source where list_url = 'https:\/\/example\.invalid\/advocaten'\)/);
  assert.match(sql, /'\{"INHERITANCE_DIRECT"\}'/);
});

test('quotes in names are escaped', () => {
  const { sql } = advisorsSql(run({ advisors: [firm({ name: "O'Brien & Co", registered_name: "O'Brien & Co Ltd" })] }), known);
  assert.match(sql, /'O''Brien & Co'/);
});

test('rejects what the page could not show or an importer could not trust', () => {
  const bad = (adv, extra) => advisorsSql(run({ advisors: [adv], ...extra }), known).errors.join('|');
  assert.match(bad(firm({ category: 'nonsense' })), /unknown category "nonsense"/);
  assert.match(bad(firm({ collected_by: 'guess' })), /collected_by must be/);
  assert.match(bad(firm({ region: 'BE-VLG' })), /not a region of NL/);
  assert.match(bad(firm({ tax_topics: ['MADE_UP'] })), /unknown tax topic/);
  assert.match(bad(firm({ services: ['yacht'] })), /unknown service/);
  assert.match(bad(firm({ source: 'https://elsewhere.invalid' })), /not listed under "sources"/);
  assert.match(bad(firm({ name: undefined })), /name missing/);
});

test('a new category may come with the run; the same firm twice in one run is an error', () => {
  const ok = advisorsSql(run({ categories: [{ code: 'notary', label: 'Notary' }], advisors: [firm({ category: 'notary' })] }), known);
  assert.deepEqual(ok.errors, []);
  assert.match(ok.sql, /insert into advisor_category .*'notary'/);
  const dup = advisorsSql(run({ advisors: [firm(), firm({ name: 'Van Dijk and Partners' })] }), known).errors.join('|');
  assert.match(dup, /duplicate of/);
});

test('source classification: manual needs instructions for Hentus, scrapeable needs the scraper contract', () => {
  const e = (s) => advisorsSql(run({ sources: [{ ...source, ...s }], advisors: [] }), known).errors.join('|');
  assert.match(e({ collection: 'manual' }), /needs "instructions"/);
  assert.equal(e({ collection: 'manual', instructions: 'Export the CSV from the members page, save in PDFs/' }), '');
  assert.match(e({ collection: 'scrapeable' }), /field_map/);
  assert.equal(e({ collection: 'scrapeable', pagination: '?page=N, 25 per page', field_map: { name: 'h2.firm', phone: 'a[href^=tel]' } }), '');
  assert.match(e({ collection: 'sometimes' }), /collection must be/);
});

test('completeness: which required fields a listing lacks decides scrapeable vs Claude-collected', () => {
  assert.equal(completeness(['name', 'registered_name', 'category', 'country', 'city', 'phone', 'website', 'email', 'source_url']).ok, true);
  const c = completeness(['name', 'category', 'country', 'city', 'phone']);
  assert.equal(c.ok, false);
  assert.deepEqual(c.missing, ['registered_name|registration_number', 'website', 'email|contact_url', 'source_url']);
  assert.ok(REQUIRED_FOR_SCRAPEABLE.length >= 9);
});
