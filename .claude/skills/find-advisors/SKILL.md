---
name: find-advisors
description: Find the firms Off_Shore_Insights should put in front of a country's wealthy clients (law firms, trust and estate planners, tax advisers, real estate, citizenship and residency, wealth managers, trust companies), register where they were found as scrapeable, Claude-collected or manual sources, and load them. Use when Hentus asks for advisors, lawyers, firms or contacts for a country or region, or wants the sources classified for his scraper.
---

# /find-advisors <country> [region] [category]

Collects **firms first** (people are a later step). The category list is open: a firm that is not a law firm is fine.
The page lists names grouped by category and region, **not clickable**; the table keeps the contact details for the later
export. Read `research/advisors/README.md` (the run-file format, which is also the contract for Hentus's scraper).

**Arguments:** the country (name or code), optionally a region and/or a category to narrow the search.
The country must exist in `jurisdiction`; if not, run `/research-country` first.

## 1. Find the sources, and classify each

Look for directories and registers where firms serving upper-market private clients are listed:
- national and regional **bar associations / law societies**; **notary** chambers;
- rankings: **Chambers** (Private Wealth), **Legal 500**, **IFLR1000**, **Citywealth**, the national equivalents;
- **STEP** (Society of Trust and Estate Practitioners) member directory; tax institutes; **family office** and **wealth manager** associations;
- **real estate** federations and luxury-property agency networks; **citizenship / residency** adviser registers;
- the **company register**, to fill each firm's registered business name and number.

For each candidate source, **sample five entries** and record which of the required fields are on the listing (README table).
Then decide:
- **`scrapeable`**: all required fields present, machine-readable, no login or captcha. Write its `pagination`, `detail_pattern` and `field_map`
  (selectors / JSON paths) precisely enough that a scraper can follow them. Test the selectors on the five entries.
- **`claude`**: the fields are incomplete, the page is dynamic, or the list is a ranking you must read. You collect it here.
- **`manual`**: needs login, captcha, a PDF or a purchase. Write `instructions` Hentus can follow in minutes: what to open, what to
  export, the file name, and where to save it (`PDFs/`). Then wait; do not work around a login or captcha.

Record `access` honestly (open / login / captcha / blocked). Do not bypass any of them.

## 2. Collect firms

For `claude` sources, and for the `scrapeable` ones until his scraper exists, fetch the pages and read the entries. Per firm collect every
field you can **see on a page**: name, registered name and number (company register), category, city and region, address, phone,
email or contact page, website, practice areas and the **tax topics** they handle (inheritance, wealth, capital gains, cross-border...),
languages, ranking / tier and who ranked it, size if stated, and whether their own site mentions Mauritius, Seychelles or offshore.
- Business contact details only. Record `found_via` (the search or filter that surfaced it) and the `source_url` of the page you read.
- A field you cannot see is left out, never guessed. A phone number must come from the firm's own page or the register.
- Prefer firms that serve private wealth and cross-border tax; drop firms that do not (`status: "excluded"` with a note, or leave them out).
- Region: set it from the firm's city when the country has regions in the database.
- No legal commentary and no ranking opinions of your own: `tier` is the ranking body's, with `ranking_source`.

## 3. Write the run file, review, apply

`research/advisors/<YYYY-MM-DD>-<CC>.json` (format in the README), then:

```bash
node research/apply-advisors.mjs research/advisors/<date>-<CC>.json     # validates, then writes db/research/advisors-<date>-<CC>.sql
node research/audit-country.mjs <CC> --sql                               # refreshes the "advisors" checklist item
```
1. Show Hentus a short summary: the sources with their classification (and for each `manual` one, what he must export), and the firms
   by category and region (names and cities; not the whole table). Applying writes to the live database: wait for his go-ahead.
2. `bash db/apply.sh db/research/advisors-<date>-<CC>.sql db/research/audit-<date>-<CC>.sql`, then refresh the fixture and look at the page.
3. Commit the run file and SQL.

## 4. Tell Hentus

- How many sources are `scrapeable` (he can point his scraper at them: give him the file paths of the source specs), how many are `claude`,
  how many are `manual` and what each manual one needs from him.
- How many firms per category and region, and what the sources did **not** cover (so he knows what the list is missing).
