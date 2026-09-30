# Off_Shore_Insights: instructions for Claude

Tax-comparison dashboard: Mauritius and Seychelles hubs against European countries. The full
spec is in [PLAN.md](PLAN.md). Owner: **Hentus** (not "Hentu"). Built and maintained by Claude.

## Hard rules

- **⛔ Frontend gate.** Don't build any UI (`apps/web`, Capacitor, styling) until Hentus has put
  the Claude Design output (graphics, style, theme) in this folder. The website and the APK must
  always share that one design.
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

## Users and checks

- `node scripts/user.mjs list|link|create|reset|disable|enable` (see the file header).
- The reusable test user is `claude-test`, with its password in `.env` as `TEST_USER_PASSWORD`.
- `node scripts/verify-access.mjs` is the end-to-end access suite. Run it after any schema, RLS
  or gateway change. When you add a check, prove it fails against a deliberately broken setup.
