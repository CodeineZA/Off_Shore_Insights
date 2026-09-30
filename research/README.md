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

**On demand only (2026-09-30).** No scheduled updates: Hentus calls `/update-offshore-insights`,
which runs every `api` and `page-extract` recipe. The n8n update workflows (W1–W4, E1) exist but
are paused.
