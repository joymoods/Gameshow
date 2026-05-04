#!/usr/bin/env bash
# =============================================================================
# BrainStorm – Interaktives Ersteinrichtungs-Script
# Führt durch alle Konfigurationsschritte und startet anschließend make deploy.
# Idempotent: bereits gesetzte Werte werden angezeigt und können übernommen werden.
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")/.."

# ---- Farben ----
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

header() { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════${RESET}" >&2; echo -e "${BOLD}${CYAN}  $*${RESET}" >&2; echo -e "${BOLD}${CYAN}══════════════════════════════════════${RESET}" >&2; }
step()   { echo -e "\n${BOLD}▸ $*${RESET}" >&2; }
ok()     { echo -e "  ${GREEN}✓${RESET} $*" >&2; }
info()   { echo -e "  ${CYAN}ℹ${RESET}  $*" >&2; }
warn()   { echo -e "  ${YELLOW}⚠${RESET}  $*" >&2; }
ask()    { echo -en "  ${BOLD}$*${RESET} " >&2; }

# ---- Hilfsfunktionen ----

# Liest einen Wert aus einer .env-Datei
env_get() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || { printf ""; return; }
  grep -E "^${key}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- || printf ""
}

# Bereinigt eine .env-Datei: entfernt alle Zeilen die kein KEY=VALUE oder Kommentar sind
env_sanitize() {
  local file="$1"
  [[ -f "$file" ]] || return
  local tmpfile="${file}.tmp"
  grep -E '^[A-Z_]+=|^#|^$' "$file" > "$tmpfile" || true
  mv "$tmpfile" "$file"
}

# Setzt/überschreibt einen Wert in einer .env-Datei — robust gegen Sonderzeichen
env_set() {
  local file="$1" key="$2" value="$3"
  local tmpfile="${file}.tmp"
  if [[ -f "$file" ]]; then
    grep -vE "^${key}=" "$file" > "$tmpfile" || true
  else
    touch "$tmpfile"
  fi
  printf '%s=%s\n' "$key" "$value" >> "$tmpfile"
  mv "$tmpfile" "$file"
}

# Interaktive Abfrage — gibt nur den finalen Wert auf stdout aus, alle Anzeigen auf stderr
# prompt_value <label> <current> <default> <secret:0|1>
prompt_value() {
  local label="$1" current="$2" default="$3" secret="${4:-0}"

  if [[ -n "$current" ]]; then
    if [[ "$secret" == "1" ]]; then
      echo -e "  Aktuell: ${YELLOW}${current:0:8}…${RESET}" >&2
    else
      echo -e "  Aktuell: ${YELLOW}${current}${RESET}" >&2
    fi
    ask "Übernehmen? [Enter] oder neu eingeben:"
  elif [[ -n "$default" ]]; then
    echo -e "  Default: ${YELLOW}${default}${RESET}" >&2
    ask "Enter für Default oder eigenen Wert eingeben:"
  else
    ask "Wert eingeben (leer = überspringen):"
  fi

  local input=""
  if [[ "$secret" == "1" ]]; then
    read -rs input; echo >&2
  else
    read -r input
  fi

  if [[ -z "$input" ]]; then
    [[ -n "$current" ]] && printf "%s" "$current" || printf "%s" "$default"
  else
    printf "%s" "$input"
  fi
}

# ============================================================================
header "BrainStorm Setup"
echo -e "\n  Dieses Script richtet alle Umgebungsvariablen ein" >&2
echo -e "  und startet anschließend make deploy." >&2
echo -e "\n  Drücke Enter um vorhandene Werte zu übernehmen." >&2
# ============================================================================

# ---- Root .env vorbereiten ----
if [[ ! -f ".env" ]]; then
  cp .env.example .env
  ok ".env aus .env.example erstellt"
else
  env_sanitize .env
  ok ".env vorhanden"
fi

# ============================================================================
step "ADMIN_TOKEN – Bearer-Token für die Backend-API"
info "Schützt alle Admin-REST-Routen. Wird automatisch ins Frontend übernommen."
# ============================================================================

cur_token="$(env_get .env ADMIN_TOKEN)"
gen_token="$(openssl rand -hex 32 2>/dev/null)"

if [[ -n "$cur_token" ]]; then
  echo -e "  Aktuell: ${YELLOW}${cur_token:0:16}…${RESET}" >&2
  ask "Übernehmen? [Enter] oder 'neu' für neuen Token:"
  read -r ans
  if [[ "$ans" == "neu" ]]; then
    cur_token="$gen_token"
    ok "Neuer Token generiert"
  else
    ok "Vorhandener Token übernommen"
  fi
else
  cur_token="$gen_token"
  ok "Token automatisch generiert: ${cur_token:0:16}…"
fi
env_set .env ADMIN_TOKEN "$cur_token"

# ============================================================================
step "ADMIN_PASSWORD_HASH – Passwort für Caddy HTTP Basic Auth (/admin/*)"
info "Schützt das Admin-Frontend im Browser. Benutzername ist immer: admin"
# ============================================================================

cur_hash="$(env_get .env ADMIN_PASSWORD_HASH)"

if [[ -n "$cur_hash" ]]; then
  echo -e "  Aktuell: ${YELLOW}${cur_hash:0:20}…${RESET}" >&2
  ask "Übernehmen? [Enter] oder neues Passwort eingeben (wird gehasht):"
  read -rs new_pass; echo >&2
  if [[ -z "$new_pass" ]]; then
    ok "Vorhandener Hash übernommen"
  else
    info "Erzeuge bcrypt-Hash via Docker + Caddy…"
    raw_hash="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext "$new_pass" 2>/dev/null)"
    cur_hash="$(printf '%s' "$raw_hash" | sed 's/\$/\$\$/g')"
    ok "Hash erzeugt"
  fi
else
  warn "Noch kein Passwort gesetzt."
  ask "Passwort eingeben (leer = kein Basic-Auth-Schutz):"
  read -rs new_pass; echo >&2
  if [[ -n "$new_pass" ]]; then
    info "Erzeuge bcrypt-Hash via Docker + Caddy…"
    raw_hash="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext "$new_pass" 2>/dev/null)"
    cur_hash="$(printf '%s' "$raw_hash" | sed 's/\$/\$\$/g')"
    ok "Hash erzeugt: ${cur_hash:0:20}…"
  else
    warn "Kein Passwort – HTTP Basic Auth ist deaktiviert!"
    cur_hash=""
  fi
fi
env_set .env ADMIN_PASSWORD_HASH "$cur_hash"

# ============================================================================
step "Admin-Frontend: VITE_API_URL"
info "URL des Go-Backends. Leer lassen wenn Admin + Backend hinter Caddy laufen."
# ============================================================================

if [[ ! -f "admin-frontend/.env" ]]; then
  cp admin-frontend/.env.example admin-frontend/.env
  ok "admin-frontend/.env aus .env.example erstellt"
else
  env_sanitize admin-frontend/.env
fi

cur_api_url="$(env_get admin-frontend/.env VITE_API_URL)"
new_api_url="$(prompt_value "VITE_API_URL (Admin)" "$cur_api_url" "" 0)"
env_set admin-frontend/.env VITE_API_URL "$new_api_url"
ok "VITE_API_URL (Admin) gesetzt: '${new_api_url}'"

# ============================================================================
step "Admin-Frontend: VITE_PLAYER_URL"
info "Öffentliche URL des Player-Frontends – erscheint im QR-Code der Lobby."
# ============================================================================

local_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
cur_player_url="$(env_get admin-frontend/.env VITE_PLAYER_URL)"
new_player_url="$(prompt_value "VITE_PLAYER_URL" "$cur_player_url" "http://${local_ip}" 0)"
env_set admin-frontend/.env VITE_PLAYER_URL "$new_player_url"
ok "VITE_PLAYER_URL gesetzt: '${new_player_url}'"

info "React-Login (VITE_ADMIN_PASSWORD_HASH) wird automatisch aus ADMIN_PASSWORD_HASH synchronisiert."

# ============================================================================
step "Player-Frontend: VITE_API_URL"
info "Gleiche URL wie beim Admin. Leer lassen wenn hinter Caddy."
# ============================================================================

if [[ ! -f "player-frontend/.env" ]]; then
  cp player-frontend/.env.example player-frontend/.env
  ok "player-frontend/.env aus .env.example erstellt"
else
  env_sanitize player-frontend/.env
fi

cur_p_api="$(env_get player-frontend/.env VITE_API_URL)"
new_p_api="$(prompt_value "VITE_API_URL (Player)" "$cur_p_api" "$new_api_url" 0)"
env_set player-frontend/.env VITE_API_URL "$new_p_api"
ok "VITE_API_URL (Player) gesetzt: '${new_p_api}'"

# ============================================================================
step "Zusammenfassung"
# ============================================================================

echo "" >&2
echo -e "  ${BOLD}Root .env:${RESET}" >&2
echo -e "    ADMIN_TOKEN          ${GREEN}$(env_get .env ADMIN_TOKEN | cut -c1-16)…${RESET}" >&2
echo -e "    ADMIN_PASSWORD_HASH  ${GREEN}$([ -n "$(env_get .env ADMIN_PASSWORD_HASH)" ] && echo 'gesetzt' || echo 'leer (kein Basic Auth)')${RESET}" >&2
echo "" >&2
echo -e "  ${BOLD}admin-frontend/.env:${RESET}" >&2
echo -e "    VITE_API_URL         ${GREEN}$(env_get admin-frontend/.env VITE_API_URL | sed 's/^$/—/')${RESET}" >&2
echo -e "    VITE_PLAYER_URL      ${GREEN}$(env_get admin-frontend/.env VITE_PLAYER_URL | sed 's/^$/—/')${RESET}" >&2
echo -e "    VITE_ADMIN_PASSWORD_HASH  ${GREEN}(wird via make sync-env aus ADMIN_PASSWORD_HASH gesetzt)${RESET}" >&2
echo "" >&2
echo -e "  ${BOLD}player-frontend/.env:${RESET}" >&2
echo -e "    VITE_API_URL         ${GREEN}$(env_get player-frontend/.env VITE_API_URL | sed 's/^$/—/')${RESET}" >&2

echo "" >&2
ask "Jetzt make deploy ausführen? [Enter = ja / Strg+C = abbrechen]"
read -r

# ============================================================================
header "make deploy"
# ============================================================================

make deploy

echo "" >&2
echo -e "${BOLD}${GREEN}✓ Setup abgeschlossen!${RESET}" >&2
echo "" >&2
echo -e "  Admin:  ${CYAN}http://${local_ip}/admin${RESET}  (Benutzer: admin)" >&2
echo -e "  Player: ${CYAN}http://${local_ip}/${RESET}" >&2
echo "" >&2
