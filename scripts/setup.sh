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

# Erzeugt einen bcrypt-Hash — probiert htpasswd, python3, dann Docker
generate_bcrypt_hash() {
  local pass="$1"
  if command -v htpasswd &>/dev/null; then
    htpasswd -bnBC 10 "" "$pass" 2>/dev/null | tr -d ':\n'
    return
  fi
  if command -v python3 &>/dev/null && python3 -c "import bcrypt" &>/dev/null 2>&1; then
    python3 -c "import bcrypt,sys; print(bcrypt.hashpw(sys.argv[1].encode(), bcrypt.gensalt(10)).decode())" "$pass" 2>/dev/null
    return
  fi
  if command -v docker &>/dev/null; then
    printf '%s' "$pass" | docker run --rm -i caddy:2-alpine caddy hash-password 2>/dev/null \
      || docker run --rm caddy:2-alpine caddy hash-password --plaintext "$pass" 2>/dev/null
    return
  fi
  warn "Weder htpasswd, python3+bcrypt noch Docker verfügbar – Hash kann nicht erzeugt werden."
  return 1
}

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

local_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"

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
  ask "Vorhandenen Token behalten? [J/n]:"
  read -r ans
  if [[ "$ans" =~ ^[nN]$ ]]; then
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
    info "Erzeuge bcrypt-Hash…"
    raw_hash="$(generate_bcrypt_hash "$new_pass")"
    cur_hash="$(printf '%s' "$raw_hash" | sed 's/\$/\$\$/g')"
    ok "Hash erzeugt"
  fi
else
  warn "Noch kein Passwort gesetzt."
  ask "Passwort eingeben (leer = kein Basic-Auth-Schutz):"
  read -rs new_pass; echo >&2
  if [[ -n "$new_pass" ]]; then
    info "Erzeuge bcrypt-Hash…"
    raw_hash="$(generate_bcrypt_hash "$new_pass")"
    cur_hash="$(printf '%s' "$raw_hash" | sed 's/\$/\$\$/g')"
    ok "Hash erzeugt: ${cur_hash:0:20}…"
  else
    warn "Kein Passwort – HTTP Basic Auth ist deaktiviert!"
    cur_hash=""
  fi
fi
env_set .env ADMIN_PASSWORD_HASH "$cur_hash"

# ============================================================================
step "Frontend-Konfiguration"
info "Frontends laufen hinter Caddy – URLs werden automatisch gesetzt."
# ============================================================================

if [[ ! -f "admin-frontend/.env" ]]; then
  cp admin-frontend/.env.example admin-frontend/.env
  ok "admin-frontend/.env aus .env.example erstellt"
else
  env_sanitize admin-frontend/.env
fi
env_set admin-frontend/.env VITE_API_URL ""
env_set admin-frontend/.env VITE_PLAYER_URL "http://${local_ip}"
ok "VITE_PLAYER_URL gesetzt: http://${local_ip}"
info "React-Login (VITE_ADMIN_PASSWORD_HASH) wird automatisch aus ADMIN_PASSWORD_HASH synchronisiert."

if [[ ! -f "player-frontend/.env" ]]; then
  cp player-frontend/.env.example player-frontend/.env
  ok "player-frontend/.env aus .env.example erstellt"
else
  env_sanitize player-frontend/.env
fi
env_set player-frontend/.env VITE_API_URL ""

# ============================================================================
step "Zusammenfassung"
# ============================================================================

echo "" >&2
echo -e "  ${BOLD}Root .env:${RESET}" >&2
echo -e "    ADMIN_TOKEN          ${GREEN}$(env_get .env ADMIN_TOKEN | cut -c1-16)…${RESET}" >&2
echo -e "    ADMIN_PASSWORD_HASH  ${GREEN}$([ -n "$(env_get .env ADMIN_PASSWORD_HASH)" ] && echo 'gesetzt' || echo 'leer (kein Basic Auth)')${RESET}" >&2
echo "" >&2
echo -e "  ${BOLD}admin-frontend/.env:${RESET}" >&2
echo -e "    VITE_API_URL         ${GREEN}— (Caddy)${RESET}" >&2
echo -e "    VITE_PLAYER_URL      ${GREEN}$(env_get admin-frontend/.env VITE_PLAYER_URL)${RESET}" >&2
echo -e "    VITE_ADMIN_PASSWORD_HASH  ${GREEN}(wird via make sync-env aus ADMIN_PASSWORD_HASH gesetzt)${RESET}" >&2
echo "" >&2
echo -e "  ${BOLD}player-frontend/.env:${RESET}" >&2
echo -e "    VITE_API_URL         ${GREEN}— (Caddy)${RESET}" >&2

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
