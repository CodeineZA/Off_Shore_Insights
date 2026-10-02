// Turn an advisors run (research/advisors/<date>-<CC>.json) into idempotent SQL:
//   node research/apply-advisors.mjs research/advisors/2026-10-05-NL.json   → db/research/advisors-2026-10-05-NL.sql
//   bash db/apply.sh db/research/advisors-2026-10-05-NL.sql
// The same file format is what a scraper writes (collected_by: "scraper"). Format: research/advisors/README.md.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advisorsSql } from './advisors-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
if (!file) { console.error('usage: node research/apply-advisors.mjs research/advisors/<date>-<CC>.json'); process.exit(2); }
const run = JSON.parse(readFileSync(file, 'utf8'));

// Which codes exist: read them from the seed (public) so the check needs no database.
const seed = readFileSync(join(here, '..', 'db', 'seed.sql'), 'utf8');
const codes = (table) => new Set([...seed.matchAll(new RegExp(`insert into (?:offshore_insights\\.)?${table} \\([^)]*\\) values([\\s\\S]*?)(?:on conflict|;)`, 'g'))]
  .flatMap((m) => [...m[1].matchAll(/^\('([A-Za-z_]+)'/gm)].map((x) => x[1])));
const known = { categories: codes('advisor_category'), taxTypes: codes('tax_type'), services: codes('service'), sourceUrls: new Set() };

const { sql, errors, counts } = advisorsSql(run, known);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
mkdirSync(join(here, '..', 'db', 'research'), { recursive: true });
const target = join(here, '..', 'db', 'research', `advisors-${basename(file).replace(/\.json$/, '.sql')}`);
writeFileSync(target, sql);
console.log(`wrote ${target}: ${counts.categories} categories, ${counts.sources} sources, ${counts.advisors} firms`);
