# Off_Shore_Insights

A private dashboard for comparing countries as markets for Mauritius and Seychelles offshore
structures. It answers one question: *is this country worth marketing to?* To do that it shows
three signals side by side:
wealth, a tax treaty with the hub, and the tax pain a trust could relieve. The full spec is in
[PLAN.md](PLAN.md).

Everything is self-hosted on a Raspberry Pi: the shared Supabase (Postgres), n8n, and a
Cloudflare Tunnel.

## Layout

| Path | What |
|---|---|
| `db/schema.sql` | Schema, RLS, views, RPCs (idempotent) |
| `db/seed.sql` | Draft tax research, 2026-09-30 |
| `db/apply.sh` | Apply SQL files to the Pi's Postgres |
| `services/auth-gateway/` | Login gateway (in-memory username cache and rate limits) |
| `server/web/` | nginx + gateway compose for the Pi |
| `scripts/` | `sync-env.sh`, `user.mjs`, `verify-access.mjs`, `deploy.sh` |
| `n8n/` | Exported workflows (no credentials) |

## Setup after cloning

```bash
git config core.hooksPath .githooks
bash scripts/sync-env.sh
node scripts/verify-access.mjs
```

`.env` is gitignored, and the pre-commit hook blocks secrets. Only `.env.example` is committed.

The figures are indicative only, not tax advice.
