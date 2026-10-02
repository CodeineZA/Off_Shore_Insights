# Research recipes: how every figure is retrieved

Every value in `tax_rate`, `treaty` and `wealth_market` comes from a **recipe** in
[`recipes.json`](recipes.json): where to fetch it, what to extract, and how to write it. That
way refreshing the data is a repeat of known steps, not new research.

Each recipe has a `method`:

| method | Automation | How |
|---|---|---|
| `api` | Script, no AI (`research/fetch-*.mjs`) | Structured source (JSON/CSV) → parse → SQL. Example: Eurostat. Can move to n8n when automation is wanted |
| `page-extract` | **`/update-offshore-insights` skill** (AI, on demand) | Fetch the page and answer the recipe's `extract` question: the figures are in prose or tables that change layout |
| `manual` | Human | Paywalled or PDF-only (e.g. some wealth reports). Hentus/Justus enter it in Studio |

Rules for every write (the skill and n8n workflows follow these):
- **Unknown stays unknown.** Only write a value the source states. "No such tax" is written as
  `0` with the source that says so.
- A value that **changed** closes the current row (`valid_to = today`) and inserts a new one
  (history). A value that is **the same** only updates `verified_on`, `source_url` and
  `next_check_on`.
- Where two sources disagree, or the only source is secondary for a claimed 0, set
  `needs_verification = true` and say why in `note`.
- Record the retrieval date in `verified_on`.

Applied data lives in `db/research/*.sql`: idempotent and public. Private notes stay in
`db/seed-private.sql`.

## Tools

| Tool | What it does |
|---|---|
| `apply-run.mjs <run.json>` | A run (jurisdictions, rates incl. closed back-year rows, treaties with dates, gates, wealth, gaps) → idempotent SQL |
| `audit-country.mjs <CODE|all> [--sql]` | The one checklist (`checklist.mjs`) against the database: what is missing, stale or blocked, and where to get it. `--fixture file` runs offline |
| `apply-advisors.mjs <run.json>` | Firms (and the sources they came from) → SQL. Format: `advisors/README.md` |
| `fetch-eurostat.mjs`, `fetch-ilo.mjs`, `fetch-fx.mjs` | api recipes. They read the countries and currencies from the database |
| tests | `node --test research/checklist.test.mjs research/advisors.test.mjs` |

**Years.** A rate row covers `[valid_from, valid_to)` and may not overlap another for the same tax (a database trigger enforces it). Back-year
rows are closed rows written from a dated source (`from`/`to` in the run); the page maps each country's tax year to the row in force on its first day.
A figure "as at" a date (`ref_date`) belongs to the tax year containing it.

**New countries:** `/research-country <name>`. **Firms:** `/find-advisors <country>`.

**On demand only (2026-09-30).** No scheduled updates: Hentus calls `/update-offshore-insights`,
which runs every `api` and `page-extract` recipe. The n8n update workflows (W1–W4, E1) exist but
are paused.
