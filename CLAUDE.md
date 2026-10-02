# Off_Shore_Insights: instructions for Claude

One-country tax and market dashboard for the Mauritius and Seychelles hubs. A world map is the slicer; there is
no global comparison. The spec is in [PLAN.md](PLAN.md). Owner: **Hentus** (not "Hentu"). Built and maintained by Claude.

## Hard rules

- **The design is law.** `interactive-graph-designs/` (Claude Design handoff) defines the theme,
  tiles and animation. The website and the APK must always share it (one codebase).
- **Scope is tax insights only.** Website analytics and search data belong to the website
  project (`Off_Shore_Trust`). Its own n8n workflow will fill the insight tables here later
  (`site_page`, `search_daily`, `search_query_monthly`, `analytics_daily`). Don't pull that data
  from here.
- **This repo is public.** Real values live only in the gitignored `.env` (see `.env.example`).
  After cloning, enable the secret hook: `git config core.hooksPath .githooks`.
- **Login never goes straight to the database** (DoS protection for the Pi). It goes through
  the gateway (`services/auth-gateway`): an in-memory username cache and in-memory rate limits.
  Never add an anon-callable RPC or table grant. Never back a rate limiter with the database.
- Only people in `offshore_insights.app_user` get access, because the shared Auth realm has
  open signup. Every new table needs RLS `using (offshore_insights.is_member())` in the same
  change, and gets added to `TABLES` in `scripts/verify-access.mjs`.

## Infrastructure

| Thing | Where |
|---|---|
| Site | `https://insights.codeine.cloud`. nginx `offshore-insights-web` on Pi port 8094, via the shared pi-tunnel |
| Login gateway | `offshore-insights-auth` (node:22-alpine, not published). nginx proxies `/api/login` and `/api/health` to it |
| Database | Shared Supabase on the Pi, schema **`offshore_insights`**. Apply with `bash db/apply.sh db/schema.sql [db/seed.sql db/seed-private.sql]` (idempotent) |
| Deploy | push `main` → GitHub webhook → n8n "Off_Shore_Insights - Git_sync" → `scripts/deploy.sh` on the Pi (`~/Off_Shore_Insights`). `--restart` in the commit message recreates the containers. A failure sends a Telegram alert |
| Telegram | n8n credential "Telegram account", chat 6688393980 |
| Connection details | `.env` (regenerate: `bash scripts/sync-env.sh`) |

Work in `D:\Claude_Projects\Off_Shore_Insights`. Never edit the Pi checkout (and never through
`Z:`).

## Frontend (`apps/web`)

Vite + React + TS. One page, `pages/Country.tsx`: **world map → country → region** (Back zooms out one step; the focus is in the URL,
`#/country/BE-VLG`). Top to bottom: year slicer, country list + layers + legend, the map (`ui/WorldMap.tsx`), then for the selected entity the
banner (`ui/Banner.tsx`), the regions with their own bar charts (`ui/RegionStrip.tsx`), the tax slicer chart (`ui/TaxSlicer.tsx`: click a market or a
tax and the page focuses on it), and the tiles. The tiles are the earlier C1–C7 views, kept until each is redesigned **one at a time with Hentus**
(question → data → chart/axes/legend, then build).

- **Data logic is plain TypeScript** in `src/data/`, tested without a browser: `taxyear.ts` (each country's own tax year), `years.ts` (rate / wealth /
  treaty for a year, year chips), `mapdata.ts` (treaty colours, money bars, zoom state), `taxbars.ts` (slicer rows and focus), `banner.ts`.
- **Years.** A selected year is the tax year that *begins* in it, in each country's own calendar (UK 2025 = 6 Apr 2025–5 Apr 2026). A rate is the one
  in force on the year's first day. A wealth figure belongs to the tax year containing its `ref_date`. The map carries an earlier year's figure forward
  (paler bar); the panels stay exact. Gates, advisors and notes are "current" and not year-filtered.
- **Map.** `npm run gen:world` → `src/map/world.ts` (Natural Earth, world-atlas 50m; ~1 MB, lazy chunk). `src/map/project.ts` places a capital with the same
  projection. Regions: `node scripts/gen-regions.mjs BE <geojson> --key NUTS_ID --map BE1=BE-BRU,...` → `src/map/regions/BE.ts`.
- **Money.** Individuals ≥US$1m (UBS millionaires), ≥US$30m (Knight Frank UHNWI), business owners (Eurostat/ILO), trusts. **No HNWI**: no source
  publishes it per country. No traffic light and no invented thresholds: raw figures, each with a year and a source; unknown is a dashed stub, never 0.
- **Regions:** a country that sets taxes per region (`jurisdiction.regional_tax_types`, e.g. BE and ES inheritance) has its regions as children. A region
  inherits every other national rate, the treaty, the lists and the money figures (labelled), never a regional tax: missing means unknown.
- Dev: `npm run env:local` once (writes the gitignored `.env.local`), then preview "offshore-insights-web" (port 5190) in `D:/Claude_Projects/.claude/launch.json`.
  `/api` is proxied to the live gateway.
- **`?fixture` (dev only, stripped from builds)** renders `apps/web/.fixture.json` (a gitignored copy of a real payload) without signing in. Don't type
  credentials into the browser. Refresh it with `node scripts/fixture.mjs` (signs in as the test user). `years.parity.test.ts` pins the client's region rule to
  the SQL view using that file and skips where it is absent.
- Screenshots of the preview time out while the pane is hidden: `tabs_select` then `screenshot` in one `browser_batch`, and retry once.
- Deploy: `deploy.sh` builds into `dist-next` and swaps it in only after tests, `tsc` and the secret scan pass. nginx mounts `apps/web` (not `dist`), so the swap is seen.

## Data: how figures are retrieved

Every figure has a **recipe** in `research/recipes.json` (edit `research/recipes.mjs`, then run
`node research/recipes.mjs`). A refresh is a **run**: `research/runs/<date>.json` →
`node research/apply-run.mjs <run>` → `db/research/<date>.sql` → `bash db/apply.sh …`. History mode
closes a changed row and opens a new one; unchanged values only refresh `verified_on`.

- `api` recipes are scripts (`research/fetch-*.mjs`), run by `/update-offshore-insights`. The n8n E1 exists but is paused.
- `page-extract` recipes run through the project skill **`/update-offshore-insights`**
  (`.claude/skills/`), which shows Hentus the diff before applying.
- A **new country** goes through **`/research-country <name>`** (codes, capital, same-everywhere-or-per-region check, treaties with both hubs, lists, money,
  three tax years, region shapes). `node research/audit-country.mjs <CODE>` is the one checklist: what is missing, stale (a new tax year began) or
  blocked, and **where Hentus can get what Claude cannot**. **Firms** go through **`/find-advisors <country>`** (format and the scrapeable / Claude /
  manual classification: `research/advisors/README.md`). **Parked by Hentus (2026-10-02): do not run it or add a firms tile until he restarts it.**
- `manual` recipes (wealth-report databooks) are entered by a human.

Never add a figure without a recipe. Rules are in `research/README.md`.

## n8n workflows

Edit `n8n/build.mjs` (structure) and `n8n/src/*.js` (Code-node logic). Then run
`node n8n/build.mjs && node n8n/push.mjs [W1 …]`. `push.mjs` creates or updates by name,
activates, and writes the IDs to `.env`. W0 (`n8n/W0-gitsync.json`) is edited directly.
Business logic lives in SQL RPCs (`due_checks`, `confirm_flag`, `flag_needs_update`,
`apply_budget_dates`, `monthly_summary`), which can be tested in a `begin … rollback` block.

| WF | When (Europe/Madrid) | What |
|---|---|---|
| W0 | GitHub push | deploy (see above) |
| W1 | daily 06:00 | re-check due sources, then flags with ✅/✏️ buttons in Telegram |
| W2 | button press | ✅ confirm / ✏️ needs update (whitelisted Telegram IDs only) |
| W3 | 1st, 08:00 | monthly summary to Telegram |
| W4 | daily 05:30 | pull rows forward after a budget date passes |
| E1 | 2nd, 05:00 | Eurostat employers → `wealth_market.business_owners` |
| Error alert | on any failure | `sync_run` error row + Telegram |

Traps already hit here (n8n 2.7):
- The error workflow must be **active**, or n8n silently skips it.
- Inside `{{ }}` expressions, **don't use `\n` escapes** ("invalid syntax"). Use real newlines
  in a `=text {{ expr }}` template.
- Telegram messages use `parse_mode: HTML`, with `& < >` escaped. The default Markdown eats
  `_` and rejects unbalanced `*`/`_`.
- A Code node in "run once for each item" mode returns `{ json }`, not `[{ json }]`.
- The Code node can call `this.helpers.httpRequest`, but `require('crypto')` is blocked (hence
  the inline SHA-256 in W1).
- Re-activating W2 re-registers the Telegram webhook, which Telegram rate-limits (push.mjs retries).
- To test a scheduled workflow, set its cron a couple of minutes ahead, push, check, then
  rebuild and push again. Git Bash has **no timezone data** (`TZ=Europe/Madrid date` prints UTC),
  so compute Madrid time as `date -u -d '+2 hours'` in summer and `+1 hour` in winter.
- The n8n container is owned by `~/server/services/n8n/docker-compose.yml`, not
  `~/server/docker-compose.yml`, which has a stale n8n block. The Pi and n8n both run on
  Europe/Madrid.

## Users and checks

- `node scripts/user.mjs list|link|create|reset|disable|enable` (see the file header).
- **User management page** (sidebar, admin only: `app_user.is_admin`, which only `hentus` has): view, edit, disable
  and delete users through the gateway's `/api/admin/users`. The gateway verifies the token itself (HS256,
  `SUPABASE_JWT_SECRET`) and rejects non-admins from memory. Passwords set there are kept in
  `app_user_password` and shown in plain text (Hentus's choice). That table is service_role only. Deleting a user
  created here deletes the login too. Deleting a linked login (the shared realm, e.g. Hentus) only removes access.
- The reusable test user is `claude-test`, with its password in `.env` as `TEST_USER_PASSWORD`.
- `node scripts/verify-access.mjs` is the end-to-end access suite. Run it after any schema, RLS
  or gateway change. When you add a check, prove it fails against a deliberately broken setup.
