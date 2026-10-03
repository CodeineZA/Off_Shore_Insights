# Offshore Tax Comparison Dashboard — Build Plan

## 1. Context

Van Wyk Auditors (South Africa) markets offshore trust structures in **Mauritius and Seychelles** to European clients. This dashboard lets the firm and its Mauritius-based partner compare countries at a glance and answer one question:

> Is this country worth marketing to?

That depends on three signals shown together on one screen:

1. **Money exists there**: the size of the wealthy population.
2. **A treaty exists**: a double taxation agreement (DTA) with Mauritius.
3. **Tax pain is high**: the taxes an offshore trust could legitimately relieve.

Target client: a "middle-class millionaire", with meaningful investable assets but not ultra-wealthy.

Design rule above all others: **simple, clean, easy to see and compare.**

## 2. Stack (decided)

| Layer | Choice |
|---|---|
| Database | Supabase, self-hosted on Raspberry Pi (Postgres) |
| Workflows | n8n, self-hosted on the Pi |
| Notifications | Telegram, sent via n8n. Reuses the existing n8n credential **"Telegram account"** and chat `6688393980` (no new bot) |
| Frontend | Static web app served from the Pi (`offshore-insights-web`, nginx on port 8094) at **https://insights.codeine.cloud** through the shared pi-tunnel |
| Mobile | One codebase for web and APK (Capacitor wraps the same build), so both always look and behave the same |

Hardware: Raspberry Pi 5, 8 GB, NVMe SSD. Supabase is the **shared** instance already running
on the Pi (one Postgres schema per app), so there is no second stack.

Frontend stack: Vite + React + TypeScript, with charts drawn as hand-built SVG to match the
Claude Design output pixel for pixel (the design isn't reproducible with ECharts). No
supabase-js: the app only needs the login gateway plus one RPC, so it uses plain `fetch`.
Capacitor wraps the same build for the APK.

The design is in `interactive-graph-designs/` (Claude Design handoff, received 2026-09-30):
- Theme: charcoal `#121110`→`#232220`, warm gold `#d8b07a`/`#e6c28c`/`#f3dcb2`, text
  `#ece6dc`/`#9a9185`, font Poppins.
- Tiles are 300 px tall with 18 px radius. Selecting a tile morph-expands it into a detail view
  with an insight panel, and the other tiles fly out.
- Section 9 maps each placeholder tile to real data.

## 3. Architecture

```
Browser / APK ─► Cloudflare pi-tunnel ─► insights.codeine.cloud ─► nginx :8094 (static build)
                                          │ supabase-js (anon key + user login, schema offshore_insights)
                                          ▼
                           shared Supabase (Kong :8000 → PostgREST, Auth, Postgres 17)
                                          ▲ service_role
   n8n ── W0 deploy · W1–W4 re-checks · E1 Eurostat ──► Telegram
    ▲
   GitHub push (main)        [later: the website project's n8n workflow → insight tables]
```

Access:
- **Login** uses the shared Supabase Auth realm, so Hentus is the same user as everywhere
  else. Users sign in with **username + password**. Hentus creates every user
  (`scripts/user.mjs`). Email and cell are optional but preferred. There is no self-signup and
  no self-service reset. Everyone gets the same features.
- **Login never goes straight to the database** (DoS protection for the Pi). The browser posts
  to the **login gateway** (`POST /api/login` on insights.codeine.cloud, container
  `offshore-insights-auth`):
  - nginx throttles `/api/` per real client IP (`CF-Connecting-IP`).
  - The gateway keeps the username list in memory, refreshed from the database once a minute
    whatever the traffic. Unknown or disabled usernames are rejected without any database or
    Auth call.
  - Per-IP, per-username and global rate limits are also in memory, so they cost no database
    writes (the lesson from the Weave `login_attempts` incident).
  - Only a known username within its limits is passed to Supabase Auth. The session goes back
    to the browser, and after login the data reads use the user's JWT.
- The shared realm allows open signup, so being logged in isn't enough. Only people listed in
  **`offshore_insights.app_user`** (and not disabled) can read anything. **Nothing** is granted
  to `anon`.
- Remaining exposure: the shared `supabase.codeine.cloud/auth/v1` endpoint is public for all
  apps. It's covered by a Cloudflare edge rate-limit rule, not by this app.
- n8n and the scripts use the **service_role key**, and they are the only writers. Humans edit
  data through Supabase Studio.
- Check it all with `node scripts/verify-access.mjs`. It uses the reusable `claude-test` user.

## 4. Data model

Principles:
- **One row per jurisdiction, per tax type, per period.** Comparing N countries is just a filter.
- **Keep history, never overwrite rates.** Close the old row with `valid_to` and insert a new one.
- **A missing row means the rate is unknown. A row with a rate of 0 means there is no such tax.** Charts must show the difference: grey for unknown, a zero-height bar for no tax.
- **Every number carries its source and verification date.**
- **Regions inherit national rates** and override only what they set themselves. This covers Spain's autonomous communities, Belgium's regions and Switzerland's cantons.

### 4.1 Schema

The live schema is **`db/schema.sql`** (idempotent; apply with `bash db/apply.sh db/schema.sql`).
Everything lives in the **`offshore_insights`** Postgres schema on the shared Supabase instance.
Tables: `jurisdiction`, `tax_type`, `tax_rate` (main fact table), `treaty`, `wealth_market`,
`jurisdiction_note`, `review_flag`, plus:

- **`app_user`**: who may use this app (see §3 Access). `is_member()` backs every RLS policy.
  `resolve_login(username)` turns a username into the Auth email for sign-in.
- **`sync_run`**: one row per n8n workflow run (freshness and failure tracking).
- A unique partial index enforces **one current row** (`valid_to is null`) per jurisdiction +
  tax type.
- **Website insight tables, filled by another project (TODO):** `site_page`, `search_daily`,
  `search_query_monthly`, `analytics_daily`. Nothing in this project writes them. The
  website/analytics project's own n8n workflow will feed them (see `Off_Shore_Trust/PLAN.md`,
  "Lead attribution"). Their columns are a first draft.

Views (all `security_invoker`): `v_current_rates` (regions inherit parent rates),
`v_hub_treaties`, `v_market_signal` (the three signals side by side per country, raw with no
score), and `v_data_health` (pending flags, overdue checks, unverified rows, last run per
workflow).

### 4.2 Seed data

All figures were researched on **2026-09-30** from secondary sources (law firms and tax guides).
Treat them as draft.

- **`db/seed.sql`** (public): tax types, jurisdictions, rates, Mauritius treaties.
- **`db/seed-private.sql`** (gitignored, because the repo is public): `jurisdiction_note`, which
  holds the info-panel notes including sales angles and warnings. The master copy is the live
  database. Edit it in Supabase Studio.
- Phase 2 re-verifies every row against the official tax authority before the dashboard is
  shown to anyone. Rows marked `needs_verification = true` had conflicting sources.
- Not yet researched: MU, SC, CH and PT rates; ZA `INCOME_TOP`; all WHT rows; Belgian regional
  inheritance; Seychelles treaties.

**Data fix, 2026-09-30** (`research/runs/2026-09-30.json`): known current rates went from 29 to
145. MU, SC, PT, CH, income-top and WHT are filled for every country, and all 6 conflicting rows
are resolved. 20 honest flags remain: Seychelles "no such tax" facts from secondary sources only,
cantonal Swiss values, Belgian regional inheritance, ES unrelated-heir multipliers, and PT
direct-line exemption. The treaty table covers MU and SC against every target country. How each
figure is retrieved: `research/recipes.json`. Refreshes: n8n (API sources) or the
`/update-offshore-insights` skill.

`wealth_market` has Eurostat employer counts (42 rows, 2020–2025, via E1). Millionaires, HNWI and UHNWI come from the UBS Global Wealth Report, the
Capgemini World Wealth Report, the Knight Frank Wealth Report and Eurostat. Use the latest
edition of each, and record the year and source on every row. Eurostat's business-owner figure
is pulled automatically by workflow E1.

## 5. Dashboard spec (first draft: superseded by §9)

Single page, Power BI style, simple and clean. It must work well on a tablet in landscape and on a phone in portrait.

```
┌──────────────┬────────────────────────────────────────────┐
│ COUNTRY      │  Treaty badges: FR ● in force  ES ● negot. │
│ SLICER       ├──────────────────────┬─────────────────────┤
│ ☑ France     │  SIMPLE CHART        │  PIE: wealth market │
│ ☑ Spain      │  headline_rate bars  │  hnwi_count share   │
│ ☐ Italy …    │                      │                     │
├──────────────┤──────────────────────┴─────────────────────┤
│ TAX TOGGLES  │  COMPLEX CHART: min–max range bars,         │
│ by category  │  thresholds + notes on hover/tap            │
│ + applies_to ├─────────────────────────────────────────────┤
│              │  INFO PANEL: jurisdiction_note, sources     │
└──────────────┴─────────────────────────────────────────────┘
```

| Element | Data source | Behaviour |
|---|---|---|
| Country slicer (top left) | `jurisdiction` | Multi-select, any N. Regions nested under their parent. Hubs (MU, SC) are hidden from the slicer. |
| Hub switch | `jurisdiction where is_offshore_hub` | Mauritius by default, Seychelles optional. Drives the treaty badges. |
| Tax toggles | `tax_type.category`, `applies_to` | Checkbox per category, plus a filter for individual / trust / company. Every tax type can be switched on or off. |
| Treaty badges | `v_hub_treaties` | Green = in force, amber = negotiating or signed, red = none, grey = unknown. |
| Simple chart | `v_current_rates.headline_rate` | Grouped bars, one group per tax type and one bar per country. Recurring taxes marked with an icon. |
| Complex chart | `rate_min`, `rate_max`, `threshold_amount`, `note` | Floating range bars. Tooltip shows threshold, note, source link and verified date. Inherited regional values labelled as such. |
| Pie chart | `wealth_market.hnwi_count` (latest year) | Share of wealthy people across the selected countries. Switchable to millionaires or business owners. |
| Info panel | `jurisdiction_note` + source list | Grouped per selected country. Warnings shown first. |
| Freshness | `verified_on`, `next_check_on`, `needs_verification` | Stale or unverified values get a dashed outline and a "check" icon. |

Rules:
- Missing data is shown as grey or "unknown", never as zero.
- Every number shown can be traced to its source URL in one tap.
- UI language: English first. Structure strings for i18n (French next; the Mauritius partner speaks French).
- Disclaimer in the footer: *indicative only, not tax advice*.

## 6. n8n workflows

**W1: Daily re-check** (runs 06:00 Europe/Madrid)
1. Query current `tax_rate` and `treaty` rows where `next_check_on <= today`.
2. For each row: HTTP GET `source_url`, strip the page to its main text, and hash it.
3. Compare the hash with `source_hash`:
   - Different → insert `review_flag` with reason `page_changed`.
   - Fetch error → insert `review_flag` with reason `fetch_failed`.
   - Same → still insert `review_flag` with reason `due`, because an unchanged page doesn't prove the rate is unchanged near budget time.
4. Send one Telegram message per flag (or batch them), with inline buttons **✅ Still correct** and **✏️ Needs update**.
5. **Never write to `tax_rate` values automatically.**

**W2: Telegram callback**
- ✅ Still correct: set the flag to `confirmed`; update the row's `verified_on` to today, `next_check_on` to the next budget cycle, and `source_hash`.
- ✏️ Needs update: set the flag to `needs_update`. A human edits the rate in Supabase Studio: close the old row with `valid_to` and insert a new one. Then mark the flag `resolved`.
- Only whitelisted Telegram user IDs can press the buttons.

**W3: Monthly summary** (runs on the 1st of each month)
- Telegram report: flags raised, confirmed and still pending; rows due next month; rows with `needs_verification`.

**W4: budget-date watcher** (daily)
- When `jurisdiction.next_budget_date` passes, pull every current row for that country forward to `next_check_on = today`.

**W0: Git_sync (deploy)**: GitHub push to `main` → SSH to the Pi: fetch → stash-if-dirty →
`merge --ff-only || reset --hard` → `bash scripts/deploy.sh` (build, `--restart` recreates the
containers, then checks that the served `index.html` matches the build). A non-zero exit code
sends a Telegram alert, so a failed deploy is never reported as success.

**E1: Eurostat** (monthly): self-employed-with-employees → `wealth_market.business_owners`.

Every workflow writes a `sync_run` row. Telegram nodes use the existing **"Telegram account"**
credential. Only `TELEGRAM_ALLOWED_USER_IDS` may press buttons.

Secrets: the service_role key and the Telegram bot token live in n8n credentials and in the
gitignored `.env` only, never in the frontend or the repo (it's public). `.githooks/pre-commit`
enforces this.

## 7. Phases

**Phase 1: Foundations** ✔ 2026-09-30
- Schema and seed applied to the shared Supabase (`offshore_insights` schema, exposed via `PGRST_DB_SCHEMAS`).
- Users: `hentus` (linked to the existing login) and `claude-test` (reusable test user).
- ✔ `node scripts/verify-access.mjs` passes: anon reads nothing, a logged-in non-member reads
  nothing, a member reads rates but can't write, and a disabled member is locked out.

**Phase 2: Verify and fill data** (human-led; this is also the learning phase)
- Re-verify every seeded row against the official authority (SARS, impots.gouv.fr, MRA, HMRC, Agencia Tributaria, and so on). Replace secondary-source URLs.
- Resolve the Belgium securities-tax conflict. Fill in Belgian regional inheritance, Mauritius, Seychelles, Switzerland, Portugal, withholding rates, and `wealth_market`.
- ✔ Done when no rows have `needs_verification = true` for the starter countries.

**Phase 3: Automation** ✔ 2026-09-30 (W2 buttons await Hentus's first real press)
- W0–W4 and E1 in n8n with Telegram, plus the error alert.
- ✔ A manually aged row produced a Telegram flag with ✅/✏️ buttons. Confirming a button press
  updates `verified_on`: waiting on the first real press.

**Phase 4: Dashboard + APK** (designs received 2026-09-30; web live 2026-09-30 at https://insights.codeine.cloud)
- Login page → landing page of tiles, built tile by tile per section 9, in the Claude Design theme.
- ✔ Done when every tile runs on live data, expands with its animation, and shows unknown as
  grey (never zero) at 768×1024 and 375×812.
- ✔ Web: all ten tiles on live data, with expand animation and insight panels, checked at
  desktop, 768×1024 and 375×812 (no sideways scroll). The login is verified at API level (the
  access suite). The first browser sign-in is Hentus's.
- APK: Capacitor wraps the same `dist/`. It needs the Android SDK on this machine, and comes
  after the web version is approved.

**Phase 5: Users** (last)
- Hentus supplies the usernames (with email and cell where available). Create them with `scripts/user.mjs`.

## 8. Open questions

- Which languages does the Mauritius partner read? French is assumed; Punjabi is unconfirmed.
- Should a combined "attractiveness score" per country be computed later? Hold this until the data is verified.
- Answered: the dashboard is private, with users created by Hentus. It runs on a Pi 5, 8 GB, with the shared Supabase.
- **Tile 10 (compounding):** what does the structure actually cost per year (trustee and
  management fees, Mauritius tax)? Until Justus supplies it, the tile uses an explicit 0.5%
  assumption, shown on screen.
- **Tile 8:** the design showed "structures set up". If the firm wants to track its own
  structures or clients, that needs a new table, entered by hand. Until then the tile shows
  review activity.

## 9. The one-country dashboard (replaces the Global / Country-vs-hubs modes, 2026-10-02)

**Decisions (Hentus, 2026-10-02):** there is no global comparison. A **world map is the slicer**; the page shows one country (or one
region) at a time. The process is run through Claude: Hentus names a country, Claude finds and loads everything the page needs, and
what it cannot get becomes an instruction for him. No legal commentary: red where a list or a missing treaty blocks, green where it is open.

The page answers: is there a treaty with Mauritius and with Seychelles; is there money (individuals, business owners, trusts); where does the tax
hurt, with the hub rate beside it. (Who do we talk to, the firms, is parked.) **As built (Hentus, 2026-10-02) the page is five things in this
order: the world map, the tax year, Where the tax hurts, the Country brief, the Prospect pool.** Every other tile was removed; a **Sources** button
beside the tax year lists the pages behind whatever is on screen.

- **Map:** treaties by colour (Mauritius gold, Seychelles teal, both striped, outline = signed or negotiating, hatched = unknown); money as a
  small bar per measure at each capital (each measure on its own scale); click a country = the slicer, its regions appear with their own bar
  charts; Back zooms out one step. A Europe view un-crowds the capitals.
- **Year slicer:** any combination of tax years, each country in its own calendar. Rates for 2024 and 2025 are back-filled from dated
  sources only; unknown stays unknown.
- **Where the tax hurts:** the taxes by market with the Mauritius and Seychelles rate beside each, one bar per chosen tax year; focusing a
  market or a tax dims the other rows and narrows the Sources list. Nothing else on the page is a tax, so nothing else reacts to it (the pool is
  people and companies, labelled "not filtered" while a focus is on).
  Hover a bar for its range, threshold, note and source; each tax carries a soft one-line explanation (CGT, WHT, ...).
- **Country brief** (light gold): both treaties with status and date, the tax year beside when the data was last checked, the lists, how the
  country is structured, then the notes (warnings first) and which figures still need verifying.
- **Prospect pool:** business owners, millionaires, UHNWI, trusts; one bar per chosen tax year on one shared scale, tiers never added up. A year
  with no figure of its own shows the newest earlier one as a paler bar; a tier nobody publishes is "not published", never 0. A region shows its
  country's figures, labelled.
- **Removed (Hentus, 2026-10-02):** Head to head, Bracket spread, Saving gap, Same client three homes, Treaty bridge and the sample-client bill.
  Other candidate panels (Open doors, Services that apply, Research status) are not planned; they come back only if he asks.
- **Money:** millionaires (UBS, net worth ≥US$1m), UHNWI (Knight Frank, ≥US$30m), business owners (Eurostat / ILO), trusts. HNWI was dropped:
  no source publishes it per country (Capgemini gives regional totals and a few markets; Henley's lists are top 20 and not a dataset).
  No money traffic light and no invented thresholds.
- **Firms:** categories are an open list; sources are classified scrapeable (for Hentus's scraper), Claude-collected, or manual
  (`research/advisors/README.md`). The page lists names, not clickable; contact details stay in the table for the later Excel export.

**Parked (Hentus, 2026-10-02):** the firms search and the "Who to talk to" tile. The tables, the `/find-advisors` skill and the run-file format stay in place; no firms are collected and no tile is added to the page until he restarts it.

How it is built and run is in [CLAUDE.md](CLAUDE.md): `/research-country`, `/find-advisors`, `/update-offshore-insights`, and `node research/audit-country.mjs`.

## 10. The report: what a million would have become (2026-10-02)

**Ask (Hentus):** a selling report, "if you invested a million in 2024 you would have X, against Y keeping it local", for one investment vehicle at a time, first a
**Trust in Mauritius or Seychelles**. It reuses the Country page's graphs, is shown on a **Reports** page, becomes a **PDF** made from the front end with the raw values in a
separate **Excel**, and is **emailed through n8n** over the Pi's SMTP to the signed-in user.

**Decisions (Hentus):** real, sourced index returns (MSCI World, US$, gross; a net series replaces it when one is fetchable) · a trust fee input on screen, 0.5 % a year until Justus
supplies real fees · back-fill every country (2024 and 2025) before relying on it · a separate Reports page in the sidebar.

**Added after the first PDF (Hentus: "it is in USD and we need to be able to change that"):** a currency switch **EUR / USD / ZAR** (PDF, Excel, chart and email subject follow it; the file name ends in the
currency) and an **Amount invested** field, because a million rand is only about 52 thousand euros and sits under the Dutch Box 3 allowance. MSCI publishes US dollars only, so the euro and rand returns are
**derived** from the dollar return and the ECB's year-end reference rates (`research/derive-index-currency.mjs`), labelled DERIVED row by row; they include the dollar's move.

**Rules that carry over:** every rate has a source and a date; unknown is never 0 (an incomplete data set gives a list of what is missing and no comparison); red/green flags drawn from
data we hold, no legal commentary; the assumptions are printed on the report. Not modelled: currency moves, inflation, dividend and interest taxes, source-country withholding, custody
fees, set-up costs, inheritance. The trust column assumes the home country does not tax the trust's growth.

**Parts:** `market_return` table + `returns[]` run section + recipe `msci-world-usd-annual` · `data/report.ts` (engine) · `pages/Reports.tsx` + `ui/report/*` (document, chart, HTML) ·
`data/reportsheets.ts` + `reportxlsx.ts` (Excel) · gateway `POST /api/report/email` · n8n workflow R1 · Gotenberg renderer (`server/render/`) · nginx location with an 8 MB body limit.

**Needs before it is live (each applied only with Hentus's go-ahead):** the schema change and the MSCI returns, USD exchange rate, the Mauritius/Seychelles back-year rows
(`research/runs/2026-10-02-hubs-back.json`) · the shared secret file on the Pi · Gotenberg image pulled and started · R1 and its two credentials pushed to n8n · a deploy with `--restart` (nginx).

**Back-fill status (2026-10-03):** the four rates the engine reads (capital gains on shares, net wealth, solidarity wealth, securities account) are on file
for 2015 to the latest closed year for MU, SC, NL, BE, DE, FR, IT, PT, ES (21 regions; the 2015 foral rows are gaps), CH (26 cantons), LU and ZA; the other
taxes have 2024 and 2025 rows for all of them. GB is not back-filled. Open items are recorded gaps with where to get them (`node research/audit-country.mjs <CODE>`).

**Open:** MSCI's terms on redistributing its figures in a PDF sent to prospects (Hentus to decide); the real trust fee schedule; whether a net-return MSCI series can be fetched.

## 11. The ten-year report (2026-10-03)

**Ask (Hentus):** a long history, starting 2015: "if €1,000,000 had been invested in 2015, what is it worth now kept in the local country, against through a Trust in Mauritius / Seychelles", and how local tax has increased over the same years. He also asked that the **latest published version of a value** win, since reports restate their own history.

**Decisions (Hentus):** ground date 2015 · default currency EUR, amount €1,000,000 (still switchable) · two graphs: the value of the money (kept local against through the trust) and the **effective tax of each year** (capital gains tax plus wealth taxes as a share of the value the year started with; the trust fee is a cost, not a tax, and is left out) · then **a page per year** · the four report taxes first · the tax back-fill is done in a separate session on the strongest model; the engine, graphs, database and tooling are done in the build session.

**The window (dynamic):** every year from 2015 stays in the database; the report opens on the last ten years (end = the latest closed year with a stored return, start = end − 10; today 2015 to 2025, next year 2016 to 2026). Nothing is incremented by hand.

**Document:** page 1 the result + both graphs · page 2 where the difference comes from, the Country page's tax chart (first and last year), flags, assumptions · one page per year (opening value, growth, each tax, fee, closing value, the year's step against local, the running lead, the rates in force with their sources) · sources paged by line budget · footer with the Van Wyk Auditors logo on every page · "page X of N" computed. About 16 pages for 11 years.

**Data model changes:** `fx_rate_year` (the ECB's rate at the end of each year; allowances are converted at the rate of THEIR year, never today's; a missing year stops the report) · `dashboard()` key `fx_history` · MSCI World USD 2015 to 2023 from the factsheet already held, EUR/ZAR derived with the same year-end rates.

**Latest version wins (research/README.md):** the newest edition that explicitly states a year's value wins; an older edition never fills a gap; disagreements are stored `nv` with both sources named; every stored value a run would change is shown as `RESTATED old → new` (`research/restated.mjs`, run by `apply-run`) before anything is applied. Source ladder for tax rates: the tax authority's per-year page, a compiled series (OECD Tax Database), a dated snapshot, otherwise unknown.

**Back-fill status:** `node research/audit-country.mjs <CODE>` shows `report:history`. 2026-10-03: MU, SC, NL, BE, DE, FR, IT, PT, ES, CH, LU and ZA are back-filled (runs `research/runs/2026-10-03-*.json`, applied on Hentus's go-ahead); GB has none for 2015 to 2025. Regions: ES 21 (wealth, capital gains for the foral territories, inheritance), CH 26 cantons (wealth, income, inheritance), IT 21 (regional income surcharge), PT 2 (Azores and Madeira income tax), BE 3 (inheritance). Region outlines on the map exist only for BE (`apps/web/src/map/regions/BE.ts`).

**Engine: tax bands (flagged by the back-fill, Hentus 2026-10-03: keep the top band, the engine should learn bands).** Dutch Box 3 in 2017 to 2022 is a deemed return in three bands of the base above the allowance (2021 and 2022: the lower of the banded method and the method on actual holdings). The rows store `headline_rate` = the top band and `rate_min` = the lowest band; the band limits and effective rates are in each row's `note`. Applying the top band to all of a portfolio above the allowance overstates the Dutch tax by about 21 to 32 % at €1m (2019: €16,261 against €12,386). Spain's banded wealth taxes are stored the same way. The engine (`data/report.ts`, `step`) needs band support (a structured band table per row) to get these years right.

**Open:** MSCI's terms on showing 11 years of its figures in client PDFs (Hentus decides) · Seychelles capital gains "official statement still to find" · Swiss cantons and Spanish regions need a rule for which one the report represents · the Internet Archive was offline on 2026-10-03, so 2015 snapshot availability is unverified (the Netherlands used the tax authority's per-year pages).
