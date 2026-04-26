# BrainStorm

Echtzeit-Spielshow-Plattform mit zwei Frontends (Admin / Player) und einem Go-Backend. Aktuell unterstützter Spieltyp: **Jeopardy**.

## Architektur

```
games/
├── backend/           Go 1.24 · WebSocket + REST API
├── admin-frontend/    React + TypeScript + Vite (Moderator)
└── player-frontend/   React + TypeScript + Vite (Teilnehmer)
```

Der Admin öffnet das Admin-Frontend, erstellt einen Room und lädt ein Quiz hoch. Spieler beitreten über den QR-Code / Room-Code im Player-Frontend.

---

## Voraussetzungen

- **Go** ≥ 1.24
- **Node.js** ≥ 20 + npm
- **Docker** + **Docker Compose** (für Deployment)

---

## Lokale Entwicklung

### Backend starten
```bash
cd backend
go run .
# läuft auf http://localhost:8080
```

### Admin-Frontend starten
```bash
cd admin-frontend
cp .env.example .env   # ggf. anpassen
npm install
npm run dev
# läuft auf http://localhost:5173
```

### Player-Frontend starten
```bash
cd player-frontend
cp .env.example .env   # ggf. anpassen
npm install
npm run dev
# läuft auf http://localhost:5174
```

---

## Docker-Deployment

### 1. Frontends bauen

Für das Caddy-Setup laufen Admin- und Player-Frontend auf derselben Origin.
Das Player-Frontend wird unter `/player` erreichbar sein.

```bash
# Admin-Frontend
cd admin-frontend
echo "VITE_API_URL=" > .env
echo "VITE_PLAYER_URL=http://DEINE-IP/player" >> .env
npm run build

# Player-Frontend
cd ../player-frontend
echo "VITE_API_URL=" > .env
npm run build

cd ..
```

> Ersetze `DEINE-IP` mit der lokalen IP deines Servers, z.B. `192.168.178.130`.

### 2. Container starten

```bash
docker compose up -d
```

Der Stack ist dann erreichbar unter:
| URL | Beschreibung |
|---|---|
| `http://DEINE-IP/` | Admin-Frontend |
| `http://DEINE-IP/player` | Player-Frontend |
| `http://DEINE-IP/api/` | Backend REST API |
| `ws://DEINE-IP/ws` | WebSocket |

---

## Umgebungsvariablen

### admin-frontend (`.env`)

| Variable | Standard | Beschreibung |
|---|---|---|
| `VITE_API_URL` | `http://<hostname>:8080` | Backend-URL (leer = gleiche Origin) |
| `VITE_PLAYER_URL` | `http://<hostname>:5174` | Player-Frontend-URL (für QR-Code) |
| `VITE_ADMIN_PIN` | _(leer)_ | PIN-Schutz; leer = deaktiviert |

### player-frontend (`.env`)

| Variable | Standard | Beschreibung |
|---|---|---|
| `VITE_API_URL` | `http://<hostname>:8080` | Backend-URL (leer = gleiche Origin) |

### Backend (Umgebungsvariablen)

| Variable | Standard | Beschreibung |
|---|---|---|
| `PORT` | `8080` | HTTP-Port |
| `UPLOAD_DIR` | `./uploads` | Verzeichnis für Medien-Uploads |

---

## Spielablauf (Jeopardy)

1. Admin erstellt Room → lädt Quiz im Builder hoch
2. Spieler beitreten per QR-Code oder Room-Code
3. Admin startet Spiel
4. Admin öffnet Frage → aktiver Spieler antwortet
5. Richtig → Punkte + nächste Frage; Falsch → Buzzer-Phase
6. Buzzer-Phase: andere Spieler können buzzern und antworten
7. Nach allen Fragen → Endscreen mit Rangliste
