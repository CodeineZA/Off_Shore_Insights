#!/usr/bin/env bash
# Apply SQL files to the shared Supabase Postgres, in order, stopping on the first error.
#   bash db/apply.sh db/schema.sql db/seed.sql db/seed-private.sql
# Runs locally on the Pi (docker present) or from Windows over SSH.
set -euo pipefail
PI="${PI:-codeine@192.168.0.50}"
PSQL='docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q'
[ $# -gt 0 ] || { echo "usage: $0 file.sql [...]" >&2; exit 2; }
for f in "$@"; do
  [ -f "$f" ] || { echo "missing: $f" >&2; exit 1; }
  echo "== applying $f"
  # Wrap each file in one transaction so a failure leaves nothing half-applied.
  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -qx supabase-db; then
    { echo 'begin;'; cat "$f"; echo 'commit;'; } | $PSQL
  else
    { echo 'begin;'; cat "$f"; echo 'commit;'; } | ssh -o ConnectTimeout=10 "$PI" "$PSQL"
  fi
done
echo "done"
