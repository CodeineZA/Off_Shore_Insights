# Off_Shore_Insights

A private dashboard that looks at one country at a time as a market for Mauritius and Seychelles offshore
structures. A world map is the slicer: pick a country (or one of its regions) and the page narrows to it: the
treaties with each hub, the money (millionaires, UHNWI, business owners, trusts), where the tax hurts and what
the hubs charge instead, and the firms to talk to. Every country is shown in its own tax year. The spec is in
[PLAN.md](PLAN.md).

Everything is self-hosted on a Raspberry Pi: the shared Supabase (Postgres), n8n, and a
Cloudflare Tunnel.

## Layout

| Path | What |
|---|---|
| `db/schema.sql` | Schema, RLS, views, RPCs (idempotent) |
| `db/seed.sql` | Tax types, jurisdictions, services, advisor categories, capitals; first research pass |
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
