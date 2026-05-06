# BrainStorm

Echtzeit-Spielshow-Plattform mit zwei Frontends (Admin / Player) und einem Go-Backend.
Aktuell unterstützter Spieltyp: **Jeopardy**.

## Architektur

```
games/
├── backend/           Go 1.24 · WebSocket + REST API · PostgreSQL · Redis
├── admin-frontend/    React + TypeScript + Vite (Moderator)
├── player-frontend/   React + TypeScript + Vite (Teilnehmer)
├── Caddyfile          Reverse Proxy (API, WS, Frontends, Basic Auth)
├── docker-compose.yml Backend + Caddy + PostgreSQL + Redis
└── Makefile           Build- und Deploy-Shortcuts
```

Admin erstellt einen Room und lädt ein Quiz hoch. Spieler beitreten per QR-Code / Room-Code.

Weitere Docs: [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) · [`docs/TODO.md`](docs/TODO.md)

---

## Quick Start (Deployment)

```bash
git clone https://github.com/joymoods/Jeopardy.git brainstorm
cd brainstorm
make setup
```

Das Script führt interaktiv durch alle Konfigurationsschritte und startet anschließend automatisch `make deploy`:

1. Generiert `ADMIN_TOKEN` (oder übernimmt vorhandenen)
2. Setzt Caddy-Basic-Auth-Passwort für `/admin/*` (bcrypt via Docker)
3. Setzt Frontend-URLs automatisch (`VITE_API_URL` = leer, `VITE_PLAYER_URL` = lokale IP)
4. Baut beide Frontends und startet den Docker-Stack

Nach erfolgreichem Setup:

| URL | Beschreibung |
|---|---|
| `http://DEINE-IP/` | Player-Frontend |
| `http://DEINE-IP/admin` | Admin-Frontend (Basic-Auth) |
| `http://DEINE-IP/api/` | Backend REST API |

---

## Makefile-Übersicht

| Befehl | Beschreibung |
|---|---|
| `make setup` | Interaktive Ersteinrichtung + Deploy |
| `make deploy` | Frontends bauen + Stack neu starten |
| `make build` | Beide Frontends bauen |
| `make sync-env` | `ADMIN_TOKEN` / `ADMIN_PASSWORD_HASH` → Frontend-Envs synchronisieren |
| `make up` | Stack starten (ohne Rebuild) |
| `make down` | Stack stoppen |
| `make test` | Go-Unit-Tests (mit Race-Detektor) |
| `make test-api` | API-Tests via Newman (Postman-Collection) |

---

## Lokale Entwicklung

Voraussetzungen: **Go ≥ 1.24**, **Node.js ≥ 20**, **Docker + Docker Compose**, **make**

```bash
# Backend
cd backend && go run .
# → http://localhost:8080 (ohne DB/Redis: In-Memory-Betrieb)

# Admin-Frontend
cd admin-frontend && cp .env.example .env && npm install && npm run dev
# → http://localhost:5173

# Player-Frontend
cd player-frontend && cp .env.example .env && npm install && npm run dev
# → http://localhost:5174
```

```bash
# Tests
cd backend && go test ./...
```

---

## Konfiguration

### Root `.env` (Docker Compose)

| Variable | Beschreibung |
|---|---|
| `ADMIN_TOKEN` | Bearer-Token für Admin-API-Routen |
| `ADMIN_PASSWORD_HASH` | Bcrypt-Hash für `/admin/*` Basic-Auth (via `make setup` generiert) |

> `$`-Zeichen im Hash müssen als `$$` geschrieben werden (Docker-Compose-Escaping).

### `admin-frontend/.env`

| Variable | Beschreibung |
|---|---|
| `VITE_ADMIN_TOKEN` | Identisch mit `ADMIN_TOKEN`; via `make sync-env` automatisch gesetzt |
| `VITE_ADMIN_PASSWORD_HASH` | Bcrypt-Hash aus `ADMIN_PASSWORD_HASH` (base64-kodiert); via `make sync-env` gesetzt; leer = kein React-Login |
| `VITE_API_URL` | Backend-URL (leer = gleiche Origin wie Caddy) |
| `VITE_PLAYER_URL` | Player-URL für QR-Code-Anzeige |

### `player-frontend/.env`

| Variable | Beschreibung |
|---|---|
| `VITE_API_URL` | Backend-URL (leer = gleiche Origin wie Caddy) |

---

## Auth-Modell

| Ebene | Mechanismus | Schützt |
|---|---|---|
| Caddy | HTTP Basic Auth | `/admin/*` Frontend |
| Backend | Bearer Token | Alle `/api/rooms/*` und Library-Write-Routen |

---

## Spielablauf (Jeopardy)

1. Admin erstellt Room → lädt Quiz hoch oder wählt aus Bibliothek
2. Spieler beitreten per QR-Code oder Room-Code
3. Admin startet Spiel und öffnet Fragen
4. Aktiver Spieler antwortet; bei Falschantwort → Buzzer-Phase
5. Nach allen Fragen → Endscreen mit Rangliste
