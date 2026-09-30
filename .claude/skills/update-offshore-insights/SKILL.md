---
name: update-offshore-insights
description: Refresh ALL Off_Shore_Insights data that needs no manual intervention, on demand. Runs the api recipes (Eurostat) with a script and re-runs every page-extract recipe in research/recipes.json (fetch the source, extract the figures), writes a dated run file, generates SQL with history, and applies it after Hentus confirms the changes. Use when asked to update, refresh, re-verify or research the offshore insights data, or when a country or tax is missing.
---

# /update-offshore-insights

Re-runs the retrieval **recipes** for the Off_Shore_Insights data. It repeats a documented method.
It is not open-ended research. Read `research/README.md` first: it holds the write rules.

**Arguments (optional):** a country code (`FR`), a recipe id (`pwc-FR-other`), `flags` (only the
rows with open review flags), or `all` (the default).

## 1. Scope

1. Load `research/recipes.json`. This skill runs everything that needs no person:
   - `api` recipes run as scripts: `node research/fetch-eurostat.mjs` →
     `db/research/eurostat-<date>.sql` (applied in step 4 together with the run).
   - `page-extract` recipes run as described below.
   - `manual` recipes (UBS, Capgemini, Knight Frank) can't be fetched; list them at the end as
     reminders for Hentus.
2. Scheduled automations are **paused** at Hentus's request (2026-09-30): nothing runs daily,
   and he calls this skill when he wants fresh data. If any review flags are still open from
   earlier W1 runs, include those rows:
   ```bash
   ssh codeine@192.168.0.50 "docker exec -i supabase-db psql -U postgres -d postgres -At -c \"select f.id, f.reason, r.jurisdiction_code, r.tax_type_code from offshore_insights.review_flag f join offshore_insights.tax_rate r on r.id = f.target_id where f.target_table='tax_rate' and f.status in ('pending','needs_update')\""
   ```
3. Read the current values for the cells in scope:
   ```bash
   ssh codeine@192.168.0.50 "docker exec -i supabase-db psql -U postgres -d postgres -At -c \"select jurisdiction_code, tax_type_code, headline_rate, rate_min, rate_max, needs_verification, source_url from offshore_insights.tax_rate where valid_to is null order by 1,2\""
   ```

## 2. Fetch and extract (one recipe at a time)

- Fetch the recipe's `url` with the recipe's `extract` text as the prompt. Ask for **exact quotes**
  and the tax year.
- If the summary looks wrong or partial, re-fetch with a stricter prompt: "reproduce the table
  row by row, do not summarise". Example: the first summary of §19 ErbStG claimed class III was a
  flat 30%; the full table showed 30%, then 50% above €6m.
- If the source is outdated or contradicts a newer law, find the newer primary source and record
  it with `source_override`. Example: PwC's Belgium individual page still denied the 2026 capital
  gains tax, which the law of 6 April 2026 introduced.
- **Unknown stays unknown.** Write only what the source states:
  - A tax the source says doesn't exist → `h: 0`.
  - A tax simply not mentioned → `h: 0` with the note "none listed in …", or leave it out if in
    doubt.
- Flag with `"nv": true` when the only source is secondary, when sources conflict, or when the
  value depends on a canton or region.
- Keep `evidence` to a short quote (under 15 words), not whole paragraphs.

## 3. Write the run file

Create `research/runs/<YYYY-MM-DD>.json` (the format is in `research/runs/2026-09-30.json`):
- `"mode": "history"`, always, after the first run.
- Every cell of every recipe you fetched, **including unchanged ones**. That is how verification
  dates get refreshed.
- `treaties` for `mra-MU-dta` / `src-SC-dta` / `pwc-MU-wht`.
- `left_unknown` for anything you couldn't settle.

## 4. Generate, review, apply

```bash
node research/apply-run.mjs research/runs/<date>.json      # → db/research/<date>.sql
```

1. **Before applying**, show Hentus a short diff: each value that changed (old → new, with its
   source), each new value, and each flag set or cleared. Applying writes to the live database, so
   wait for his go-ahead.
2. Apply with `bash db/apply.sh db/research/<date>.sql db/research/eurostat-<date>.sql`. It's
   idempotent, so running it twice is harmless.
3. Resolve the W1 flags you answered: `status = 'resolved'`, `reviewed_by = 'claude: /update-offshore-insights <date>'`.
4. Check the access suite still passes: `node scripts/verify-access.mjs`.
5. Commit the run file and SQL (the public repo is fine: these are public sources), then push.

## 5. Report

- What changed and what was newly filled.
- What is still flagged, and why.
- The manual recipes that are due.
- Any recipe whose URL broke or moved. Update `research/recipes.mjs` and regenerate
  `recipes.json`, so the method stays current.

## Automations (paused)

n8n still has W1 (daily source re-check), W2 (Telegram buttons), W3 (monthly summary), W4 (budget
watcher) and E1 (Eurostat), all **inactive** since 2026-09-30. `n8n/push.mjs` keeps them inactive.
Turn them on only when Hentus asks for automated updates.
