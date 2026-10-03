---
name: research-country
description: Research a country for Off_Shore_Insights from nothing, or complete one we already hold. Resolves its codes and capital, checks whether its taxes are the same everywhere or set per region (and creates the regions as children), then fills treaty with Mauritius and Seychelles, the red/green lists, money figures (millionaires, UHNWI, business owners, trusts), the tax rates for the last three tax years (and, for the four taxes the ten-year report reads, every tax year back to 2015), and the map shapes; audits the result against the one checklist; and turns whatever cannot be fetched into a "where to get it" instruction for Hentus. Use when Hentus names a country to add (e.g. "research the Netherlands", "add Austria"), or asks what is missing for one.
---

# /research-country <country>

You are the one who fetches. Hentus names a country; you find everything the page needs and load it. What you
cannot get becomes an instruction for him (where to go, what to download), and when he brings it you import it.
**No legal commentary** anywhere: the page shows facts, red where something blocks, green where it is open.
Read `research/README.md` (write rules) and `research/checklist.mjs` (the one list of what a country needs).

**Argument:** a country name or ISO code (`Netherlands`, `NL`). If it already exists in `jurisdiction`, this completes it.

## 1. Resolve it

- ISO2 code (the `jurisdiction.code`), ISO3, currency, capital with coordinates, the tax year start (`MM-DD`),
  the next budget date if there is one. Look them up; do not guess a capital's coordinates.
- Check the database first: `node research/audit-country.mjs <CODE>` shows what is already held.
- The country's `estate_basis`: `heirs` if inheritance tax is charged on each heir's share, `estate` if on the whole estate.

## 2. Structure check: the same everywhere, or per region?

This decides whether the country has **children** (Belgium does, France does not).
- Ask of each tax the page tracks (inheritance, net wealth, property wealth, capital gains, income): *who sets the rate*, the
  nation or a lower level (region, state, canton, autonomous community, province)?
- Those taxes become `regional_tax_types`. If there are none, record that the country was checked and is uniform.
- For each region that sets them, create a child `jurisdiction` with its **ISO 3166-2 code** (`BE-VLG`), `parent`, `kind: "region"`,
  and a label point (`lon`/`lat`). A country with dozens of regions (US states, Swiss cantons): create the ones that differ, and say
  in `structure_note` how many exist. Never invent a region's rate: leave it out and it shows as unknown.
- Write `structure_checked_on` (today) and `structure_note` ("Inheritance tax is set by the 3 regions").

## 3. Fill the checklist

Work through `node research/audit-country.mjs <CODE>` item by item. Every figure needs a recipe in `research/recipes.mjs`
(`pwc('XX','slug')` covers the national tax pages; add a recipe for any other source, then `node research/recipes.mjs`).

| Item | Source | Notes |
|---|---|---|
| `treaty:MU`, `treaty:SC` + dates | `mra-MU-dta`, `src-SC-dta` | status, `signed_on`, `in_force_on`, WHT. A treaty with no date found: say "date to confirm", never invent one |
| `gate:blacklist:MU/SC` | the list the country applies (EU Annex I, national lists) | green not listed, amber on a watch list, red listed |
| `gate:trust_recognition` | HCCH Trusts Convention | |
| `tax:*` (13 types), country and each region's own | PwC Worldwide Tax Summaries, the regional authority | rate, bands, threshold, tax year. Primary source wins over PwC |
| `history:<year>` | dated snapshots / the year's official source | the last **three** tax years, all 13 taxes. See "Back years" |
| `report:history` | the source ladder in "Back years" | the four taxes the ten-year report reads (`CGT_FINANCIAL`, `WEALTH_NET`, `WEALTH_SOLIDARITY`, `SECURITIES_ACCOUNT`) for every tax year from the window start (2015 today; the window is the last closed year and the ten before it, so it moves by itself). The audit shows "n of 44 cells" |
| `wealth:millionaires` | UBS Global Wealth Report, Millionaire Index table (`PDFs/`) | net worth ≥US$1m. Not in the table = not published, never 0 |
| `wealth:uhnwi_count` | Knight Frank Wealth Report, Databank (`PDFs/`) | ≥US$30m. Countries under 500 UHNWIs are not listed |
| `wealth:business_owners` | `node research/fetch-eurostat.mjs`, then `fetch-ilo.mjs` | Eurostat, else ILO |
| `wealth:trusts_count` | the country's trust register / ministry statistics | few publish it; say so |

There is **no HNWI** metric: no source publishes it per country.

**Back years.** Two depths: the three most recent tax years for all 13 taxes (`history:<year>`), and **2015 onward for the four taxes the
report reads** (`report:history`). For each cell use the highest rung of this ladder that states that tax year **explicitly**:
(1) the tax authority's own per-year page or table; (2) a compiled series that states the year (e.g. the OECD Tax Database), newest edition;
(3) a dated snapshot (Wayback Machine) of a secondary page (PwC, KPMG) nearest the end of that tax year; (4) otherwise leave it unknown and write a gap.
**The newest edition that explicitly states a year wins.** A page that shows only today's rate is not evidence for an earlier year; an older
edition never fills a gap in a newer one; if two sources disagree on a year, store the newer one with `"nv": true` and name both in `note`.
A tax that did not exist in a year is a dated **0 whose source says so**, not an unknown. Write closed rows with `from`/`to` set to that tax
year's dates and `verified_on` = the date you read the source (the snapshot's date for a snapshot); the `source_url` is the address you read.
A figure for a year is the rate in force on that tax year's **first day**; if it changed mid-year, say so in `note`.

Write everything into one run file `research/runs/<date>-<CODE>.json` (shapes: `research/apply-run.mjs` header comment):
`jurisdictions`, `rates`, `treaties`, `gates`, `wealth`, and `gaps` for what is blocked.

## 4. Map shapes for the regions

If the country has regions: fetch their outlines (geoBoundaries ADM1, `https://www.geoboundaries.org/api/current/gbOpen/<ISO3>/ADM1/`,
or Natural Earth admin-1). If the source gives provinces, dissolve them into the regions that set the tax. Project them with the same
projection as the world (`apps/web/scripts/gen-regions.mjs <ISO2> <geojson>`) into `src/map/regions/<ISO2>.ts`. No shape found:
the regions still appear as cards with their own bar charts; record a `gaps` item for `geometry:regions`.

## 5. Gaps: what you cannot fetch

For every checklist item you could not fill, add a `gaps` entry with `status: "blocked"` and a `where_to_get` that a person can
follow: **what** to download, **from where** (URL), **where to put it** (`PDFs/`), and which table or page inside it. Example:
"UBS Global Wealth Report 2026 databook, sheet 'Adults by wealth band', row Netherlands → save in PDFs/". Then **tell Hentus the
list in plain words** at the end. When he delivers a file, read it, add the values to a run, and re-audit.

## 6. Generate, audit, review, apply

```bash
node research/apply-run.mjs research/runs/<date>-<CODE>.json     # → db/research/<date>-<CODE>.sql
node research/audit-country.mjs <CODE> --sql                     # → db/research/audit-<date>-<CODE>.sql
```
1. Show Hentus a short diff: the country and regions created, each value with its source, each date, and the blocked list. `apply-run` prints
   the **RESTATED old → new** list (stored closed-year values this run would change, with both sources); include it, or say that none changed.
   Applying writes to the live database: wait for his go-ahead.
2. `bash db/apply.sh db/research/<date>-<CODE>.sql db/research/audit-<date>-<CODE>.sql`, then run the audit again: the open items
   must be exactly the blocked ones.
3. `node --test research/checklist.test.mjs research/advisors.test.mjs` and `cd apps/web && npm test` must pass.
4. `node scripts/verify-access.mjs`, commit the run and SQL, refresh the fixture (`node scripts/fixture.mjs`), then look at the page:
   the country on the map (treaty colour, bars at its capital), its country brief, its prospect pool and its regions.

## Rules that never bend

- Unknown stays unknown. A missing figure is a dashed stub, never 0.
- Every number has a source and a date. A secondary-only or conflicting source sets `"nv": true`.
- Back-year figures only from a dated source.
- Do not write what is legal or illegal, and do not soften or warn. Red and green are the lists' own verdicts.

## Money back years: one edition per series

UBS and Knight Frank restate their history in every edition, so an older edition is **not** a back year of the same series (UBS: France
2,897k at end-2024 in the 2025 edition, 2,388k at end-2025 in the 2026 edition; Knight Frank: Netherlands UHNWI 8,390 for 2023 in the 2024 edition,
5,077 for 2026 in the 2026 edition). Fill a money year only from the edition that gives it. Employer counts (Eurostat / ILO) are true annual series.
Firms (`/find-advisors`) are parked by Hentus (2026-10-02): record the checklist item as blocked, do not search.
