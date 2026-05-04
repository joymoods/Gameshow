#!/usr/bin/env bash
# Synchronisiert Variablen aus der Root-.env ins admin-frontend/.env
set -euo pipefail
cd "$(dirname "$0")/.."

env_set() {
  local file="$1" key="$2" value="$3"
  local tmp="${file}.tmp"
  grep -vE "^${key}=" "$file" > "$tmp" 2>/dev/null || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$file"
}

# ADMIN_TOKEN → VITE_ADMIN_TOKEN
token="$(grep -E '^ADMIN_TOKEN=' .env 2>/dev/null | cut -d= -f2-)"
if [[ -z "$token" ]]; then
  echo "ERROR: ADMIN_TOKEN nicht in .env gefunden." >&2; exit 1
fi
[[ -f admin-frontend/.env ]] || touch admin-frontend/.env
env_set admin-frontend/.env VITE_ADMIN_TOKEN "$token"
echo "✓ VITE_ADMIN_TOKEN gesetzt"

# ADMIN_PASSWORD_HASH → VITE_ADMIN_PASSWORD_HASH
# $$ → $ unescapen, dann als base64 speichern (verhindert dotenv-expand-Probleme mit $-Zeichen)
raw_hash="$(grep -E '^ADMIN_PASSWORD_HASH=' .env 2>/dev/null | cut -d= -f2-)"
if [[ -n "$raw_hash" ]]; then
  hash="$(printf '%s' "$raw_hash" | sed 's/\$\$/\$/g')"
  hash_b64="$(printf '%s' "$hash" | base64 | tr -d '\n')"
  env_set admin-frontend/.env VITE_ADMIN_PASSWORD_HASH "$hash_b64"
  echo "✓ VITE_ADMIN_PASSWORD_HASH gesetzt (base64)"
else
  env_set admin-frontend/.env VITE_ADMIN_PASSWORD_HASH ""
  echo "  VITE_ADMIN_PASSWORD_HASH leer (kein React-Login)"
fi
