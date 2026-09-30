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

`wealth_market` has no rows yet. Fill it in Phase 2 from the UBS Global Wealth Report, the
Capgemini World Wealth Report, the Knight Frank Wealth Report and Eurostat. Use the latest
edition of each, and record the year and source on every row. Eurostat's business-owner figure
is pulled automatically by workflow E1.

## 5. Dashboard spec

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

## 9. Dashboards and tiles

**Two modes, one sidebar** (spec from Hentus, 2026-09-30). The rule is simplicity, minimalism,
and a clear separation of use. The Claude Design output defines the look only. Every tile's
question, data, axes and legend are agreed first, then built **one at a time** and checked
against the database.

### Mode 1: Global (all countries compared), `#/global`

Every chart here is filtered by the **country slicer** and the **tax-type toggles** (category
plus applies-to).

| # | Graph | Use | Data it presents | Data status (2026-09-30) |
|---|---|---|---|---|
| G1 | Ranked horizontal bar (default view) | "Which countries first?" at a glance | Opportunity score per country, sorted high to low. Bar segments = market size, tax pain, ease of reach | ⚠️ **Needs the score formula**: how each segment is measured and weighted. Inputs are partly available |
| G2 | Gate matrix (traffic-light grid) | Which countries are blocked | Rows = countries. Columns = treaty, blacklist status, trust recognition, cross-border marketing allowed. Green / amber / red / grey (unknown) | ⚠️ Treaty exists. The other gates are **not stored**: new `jurisdiction_gate` table |
| G3 | Bubble chart (market vs pain) | The sweet spot: big market, high tax pain | X = HNWI count (or per 1,000 adults), Y = worked-example total tax, size = business owners, colour = treaty status | ⚠️ HNWI, adult population and the G5 model are missing |
| G4 | Tax heatmap | Where the pain is, by tax type | Countries × tax types. Colour intensity = headline_rate. Grey = unknown, never zero | ✅ **Built first** |
| G5 | Stacked bar (worked example) | Many rates → one euro figure | Total tax on a sample client (€2m invested, 20 years, then inherited) per country, stacked by tax type | ⚠️ **Needs the sample-client model** agreed |
| G6 | Donut | Where the wealthy people are | Share of `hnwi_count` across the selected countries. Switchable to millionaires or business owners | ⚠️ Only business owners so far (Eurostat) |
| G7 | Trend arrows (small table) | Rising pain = hot market | Direction of each key rate (up / down / flat) from the `valid_from` history | ⚠️ No closed history rows yet, so all flat |

### Mode 2: 1 : 2 (one country vs Mauritius and Seychelles), `#/country`

| # | Graph | Use | Data it presents | Data status |
|---|---|---|---|---|
| C1 | Grouped bar | The plain comparison, three bars per tax type | headline_rate: chosen country, Mauritius, Seychelles | ⚠️ Hub rates not researched, so they show unknown |
| C2 | Range bar | Taxes with more than one rate | rate_min–rate_max per tax type for the three jurisdictions. Tooltip: threshold, note, source, verified date | ⚠️ Same |
| C3 | Diverging bar (the gap) | The sales argument: the biggest difference | Country rate − hub rate per tax type; positive = the country taxes more | ⚠️ Same |
| C4 | Stacked bar (worked example) | One number per jurisdiction | Total tax on the same sample client in each of the three, by tax type | ⚠️ Needs the G5 model and hub rates |
| C5 | Treaty card | Does the handshake exist, and what is it worth? | Treaty status with each hub, signed and in-force dates, treaty WHT on dividends and interest vs domestic | ⚠️ Status and dates exist. Treaty WHT and domestic WHT rates not seeded |
| C6 | Donut | The country has prospects | Wealth split: millionaires, HNWI, UHNWI, business owners | ⚠️ Business owners only |
| C7 | Info panel | The "why" and the caveats | Gate badges + `jurisdiction_note` items, warnings first | ⚠️ Notes exist. Gates need `jurisdiction_gate` |

**Known gap:** Mauritius and Seychelles rates aren't researched yet. The seed has Mauritius
treaty rows but no tax rates for either hub, so C1–C4 show "unknown" until Phase 2 fills them.

### Build order

G4 → then the tiles whose data exists, while the decisions for the others are agreed.

Tiles built so far: G4.
