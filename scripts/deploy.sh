#!/usr/bin/env bash
# Runs ON THE PI, called by the n8n "Off_Shore_Insights - Git_sync" workflow after
# the checkout has been synced to origin/main.
#   bash scripts/deploy.sh [restart]
# Exits non-zero on any failure — the workflow alerts Telegram on a non-zero code.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=8094
CONTAINER=offshore-insights-web

# 1. Build the frontend into dist-next, then swap it in. A failed build (or failed tests,
#    typecheck or secret scan) leaves the current site untouched.
SB=/home/codeine/server/services/supabase/.env
WEB=apps/web
{
  echo "VITE_SUPABASE_URL=$(grep -E '^SUPABASE_PUBLIC_URL=' "$SB" | cut -d= -f2-)"
  echo "VITE_SUPABASE_ANON_KEY=$(grep -E '^ANON_KEY=' "$SB" | cut -d= -f2-)"
  echo "VITE_SUPABASE_SCHEMA=offshore_insights"
} > "$WEB/.env.local"
(cd "$WEB" && npm ci --no-audit --no-fund && npm test && npx tsc -b && npx vite build --outDir dist-next --emptyOutDir)
# The bundle may only ever carry the anon key.
for k in SERVICE_ROLE_KEY JWT_SECRET POSTGRES_PASSWORD; do
  v=$(grep -E "^$k=" "$SB" | cut -d= -f2-)
  if [ -n "$v" ] && grep -rqF -- "$v" "$WEB/dist-next"; then
    rm -rf "$WEB/dist-next"; echo "ABORT: $k found in the build" >&2; exit 1
  fi
done
rm -rf "$WEB/dist.old"
[ -d "$WEB/dist" ] && mv "$WEB/dist" "$WEB/dist.old"
mv "$WEB/dist-next" "$WEB/dist"
SRC=$WEB/dist/index.html

# 2. Keys for the login gateway, always fresh from the shared Supabase master (gitignored).
SB=/home/codeine/server/services/supabase/.env
umask 077
{
  echo "# Written by scripts/deploy.sh from $SB — do not edit"
  echo "SUPABASE_ANON_KEY=$(grep -E '^ANON_KEY=' "$SB" | cut -d= -f2-)"
  echo "SUPABASE_SERVICE_ROLE_KEY=$(grep -E '^SERVICE_ROLE_KEY=' "$SB" | cut -d= -f2-)"
  echo "SUPABASE_JWT_SECRET=$(grep -E '^JWT_SECRET=' "$SB" | cut -d= -f2-)"   # verifies admin tokens
  # Shared with n8n's report webhook (n8n/push.mjs makes it). Kept in a file on the Pi, outside the repo; absent = emailing reports is off.
  RS=/home/codeine/.offshore-insights-report-secret
  if [ -s "$RS" ]; then echo "REPORT_WEBHOOK_SECRET=$(tr -d '\r\n' < "$RS")"; fi
} > server/web/.env

# 2b. The report renderer (Gotenberg; only n8n reaches it). A no-op when it is already running.
if [ -f server/render/docker-compose.yml ]; then (cd server/render && docker compose up -d) || echo "WARN: report renderer did not start (emailed reports will fail)" >&2; fi

# 3. (Re)create containers when asked or when missing. The gateway's code is mounted,
#    so restart it every deploy to pick up changes (a ~1 s blip for login only).
if [ "${1:-}" = restart ] || ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  (cd server/web && docker compose up -d --force-recreate)
else
  (cd server/web && docker compose up -d && docker compose restart auth)
fi
for i in $(seq 1 15); do
  curl -fsS "http://localhost:$PORT/api/health" 2>/dev/null | grep -q '"ok":true' && break
  sleep 1
done
curl -fsS "http://localhost:$PORT/api/health" | grep -q '"ok":true' \
  || { echo "ABORT: login gateway not healthy" >&2; exit 1; }

# 4. Prove the new build is what's being served.
served=$(curl -fsS "http://localhost:$PORT/index.html" | sha1sum | cut -d' ' -f1)
built=$(sha1sum "$SRC" | cut -d' ' -f1)
if [ "$served" != "$built" ]; then
  echo "ABORT: served index.html ($served) != $SRC ($built)" >&2; exit 1
fi
echo "deploy ok: $(git log --oneline -1)"
