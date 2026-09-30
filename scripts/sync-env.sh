#!/usr/bin/env bash
# Rebuild .env from .env.example + the Pi's master files.
#   bash scripts/sync-env.sh [pi-host]      (default codeine@192.168.0.50)
# Precedence per key: live master value > value already in .env > template default.
# Nothing secret is printed; only key names are reported.
set -euo pipefail
cd "$(dirname "$0")/.."
PI="${1:-codeine@192.168.0.50}"

masters=$(ssh -o ConnectTimeout=10 "$PI" 'python3 - <<"PY"
import re, os
def load(p):
    d = {}
    try:
        for line in open(os.path.expanduser(p)):
            m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
            if m:
                v = m.group(2)
                if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'"'"'":
                    v = v[1:-1]
                d[m.group(1)] = v
    except FileNotFoundError:
        pass
    return d
sb  = load("~/server/services/supabase/.env")
wv  = load("~/Weave_proj/.env")
net = load("~/.env.network")
n8n = load("~/server/services/n8n/.env")
md  = open(os.path.expanduser("~/server/services/n8n/Claude_n8n.md")).read()
key = re.search(r"eyJ[A-Za-z0-9._-]+", md)
out = {
    "SUPABASE_URL": sb.get("SUPABASE_PUBLIC_URL"),
    "SUPABASE_ANON_KEY": sb.get("ANON_KEY"),
    "SUPABASE_SERVICE_ROLE_KEY": sb.get("SERVICE_ROLE_KEY"),
    "SUPABASE_JWT_SECRET": sb.get("JWT_SECRET"),
    "POSTGRES_PASSWORD": sb.get("POSTGRES_PASSWORD"),
    "POSTGRES_PORT": sb.get("POSTGRES_PORT"),
    "POOLER_TENANT_ID": sb.get("POOLER_TENANT_ID"),
    "SUPABASE_DASHBOARD_USER": sb.get("DASHBOARD_USERNAME"),
    "SUPABASE_DASHBOARD_PASS": sb.get("DASHBOARD_PASSWORD"),
    "CF_API_TOKEN": wv.get("CF_API_TOKEN"),
    "CF_ACCOUNT_ID": wv.get("CF_ACCOUNT_ID"),
    "CF_ZONE_ID": wv.get("CF_ZONE_ID"),
    "PI_LAN_IP": net.get("ETH_IP"),
    "PI_WIFI_IP": net.get("WIFI_IP"),
    "N8N_URL": n8n.get("N8N_EDITOR_BASE_URL"),
    "N8N_API_KEY": key.group(0) if key else None,
}
for k, v in out.items():
    if v:
        print(f"{k}={v}")
PY')

declare -A M E
while IFS= read -r l; do [ -n "$l" ] && M["${l%%=*}"]="${l#*=}"; done <<<"$masters"
if [ -f .env ]; then
  while IFS= read -r l; do
    [[ "$l" =~ ^[A-Z0-9_]+= ]] && E["${l%%=*}"]="${l#*=}"
  done < .env
fi

tmp=$(mktemp)
from_master=(); kept=(); empty=()
while IFS= read -r l || [ -n "$l" ]; do
  if [[ "$l" =~ ^([A-Z0-9_]+)=(.*)$ ]]; then
    k="${BASH_REMATCH[1]}"; v="${BASH_REMATCH[2]}"
    if [ -n "${M[$k]:-}" ]; then v="${M[$k]}"; from_master+=("$k")
    elif [ -n "${E[$k]:-}" ]; then v="${E[$k]}"; kept+=("$k")
    fi
    [ -z "$v" ] && empty+=("$k")
    printf '%s=%s\n' "$k" "$v" >> "$tmp"
  else
    printf '%s\n' "$l" >> "$tmp"
  fi
done < .env.example
sed -i '0,/^# This is the COMMITTED template.*$/s//# REAL VALUES — gitignored, never commit. Regenerate: bash scripts\/sync-env.sh/' "$tmp"
mv "$tmp" .env
chmod 600 .env 2>/dev/null || true

echo "Wrote .env"
echo "  from masters: ${from_master[*]:-none}"
echo "  kept local:   ${kept[*]:-none}"
echo "  still empty:  ${empty[*]:-none}"
