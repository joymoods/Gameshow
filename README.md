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

Der Admin öffnet das Admin-Frontend, erstellt einen Room und lädt ein Quiz hoch.
Spieler beitreten über den QR-Code / Room-Code im Player-Frontend.

Weitere Dokumentation:
- [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) – Architektur, REST-API, WS-Protokoll
- [`docs/testing/TESTPLAN.md`](docs/testing/TESTPLAN.md) – Manueller Testplan
- [`docs/TODO.md`](docs/TODO.md) – Projekt-Backlog

---

## Voraussetzungen

- **Go** ≥ 1.24
- **Node.js** ≥ 20 + npm
- **Docker** + **Docker Compose** (für Deployment)
- **make** (für Build-Shortcuts)

---

## Lokale Entwicklung

### Backend starten
```bash
cd backend
go run .
# läuft auf http://localhost:8080
# ohne DATABASE_URL / REDIS_URL: In-Memory-Betrieb (keine Quiz-Bibliothek)
```

### Admin-Frontend starten
```bash
cd admin-frontend
cp .env.example .env   # VITE_ADMIN_TOKEN eintragen (s. Root-.env → ADMIN_TOKEN)
npm install
npm run dev
# läuft auf http://localhost:5173
```

### Player-Frontend starten
```bash
cd player-frontend
cp .env.example .env   # ggf. VITE_API_URL anpassen
npm install
npm run dev
# läuft auf http://localhost:5174
```

---

## Tests

```bash
cd backend
go test ./...
```

Abgedeckt: `game/core` (Manager, Room), `game/jeopardy` (Spiellogik), `api` (REST-Endpunkte inkl. Auth).

---

## Docker-Deployment

### 1. Secrets konfigurieren

```bash
cp .env.example .env
```

`.env` ausfüllen:

```bash
# Admin-API-Token (Bearer-Auth für alle /api/rooms/* und Library-Write-Routen)
ADMIN_TOKEN=$(openssl rand -hex 32)

# Bcrypt-Hash für HTTP-Basic-Auth des Admin-Frontends (/admin/*)
# Interaktiv: Passwort eingeben → Hash kopieren
docker run --rm -it caddy:2-alpine caddy hash-password
# WICHTIG: '$' im Hash als '$$' schreiben (Docker-Compose-Escaping)
# Beispiel: $2a$14$abc...  →  $$2a$$14$$abc...
ADMIN_PASSWORD_HASH=$$2a$$14$$...
```

### 2. Frontends bauen

`make build` liest `ADMIN_TOKEN` automatisch aus der Root-`.env` und setzt ihn als
`VITE_ADMIN_TOKEN` im Admin-Frontend — kein manuelles Duplizieren nötig.

```bash
make build          # beide Frontends
# oder einzeln:
make build-admin    # nur Admin (inkl. Token-Sync)
make build-player   # nur Player
```

### 3. Stack starten

```bash
docker compose up -d
# oder alles in einem:
make deploy         # build + docker compose up -d --build
```

Der Stack ist dann erreichbar unter:

| URL | Beschreibung |
|---|---|
| `http://DEINE-IP/` | Player-Frontend |
| `http://DEINE-IP/admin` | Admin-Frontend (Basic-Auth-Passwort erforderlich) |
| `http://DEINE-IP/api/` | Backend REST API |
| `ws://DEINE-IP/ws` | WebSocket |

---

## Umgebungsvariablen

### Root `.env` (Docker Compose)

| Variable | Beschreibung | Erzeugen |
|---|---|---|
| `ADMIN_TOKEN` | Bearer-Token für Admin-API-Routen | `openssl rand -hex 32` |
| `ADMIN_PASSWORD_HASH` | Bcrypt-Hash für `/admin/*` Basic-Auth | `docker run --rm -it caddy:2-alpine caddy hash-password` |

> `$`-Zeichen im Hash müssen als `$$` geschrieben werden.

### `admin-frontend/.env`

| Variable | Standard | Beschreibung |
|---|---|---|
| `VITE_ADMIN_TOKEN` | — | Identisch mit `ADMIN_TOKEN`; via `make build` automatisch gesetzt |
| `VITE_API_URL` | _(leer = gleiche Origin)_ | Backend-URL für lokale Entwicklung |
| `VITE_PLAYER_URL` | _(leer)_ | Player-URL für QR-Code-Anzeige |
| `VITE_ADMIN_PIN` | _(leer)_ | Optionaler clientseitiger PIN-Schutz |

### `player-frontend/.env`

| Variable | Standard | Beschreibung |
|---|---|---|
| `VITE_API_URL` | _(leer = gleiche Origin)_ | Backend-URL für lokale Entwicklung |

### Backend (via `docker-compose.yml`)

| Variable | Standard | Beschreibung |
|---|---|---|
| `PORT` | `8080` | HTTP-Port |
| `UPLOAD_DIR` | `./uploads` | Verzeichnis für Medien-Uploads |
| `DATABASE_URL` | — | PostgreSQL DSN (optional; ohne = kein Persist) |
| `REDIS_URL` | — | Redis URL (optional; Cache für Sessions) |
| `ADMIN_TOKEN` | — | Aus Root-`.env` übernommen |

---

## Auth-Modell

| Ebene | Mechanismus | Schützt |
|---|---|---|
| Caddy | HTTP Basic Auth | `/admin/*` Frontend |
| Backend | Bearer Token (`Authorization: Bearer <ADMIN_TOKEN>`) | Alle `/api/rooms/*` Routen und Library-Write-Routen |
| Frontend | `VITE_ADMIN_TOKEN` (Build-Zeit) | Alle API-Aufrufe aus dem Admin-Frontend |

---

## Spielablauf (Jeopardy)

1. Admin erstellt Room → lädt Quiz im Builder hoch oder wählt aus der Bibliothek
2. Spieler beitreten per QR-Code oder Room-Code
3. Admin startet Spiel
4. Admin öffnet Frage → aktiver Spieler antwortet; Admin kann optional Timer starten
5. Richtig → Punkte + nächste Frage; Falsch → Buzzer-Phase
6. Buzzer-Phase: andere Spieler können buzzern und antworten
7. Nach allen Fragen → Endscreen mit Rangliste
