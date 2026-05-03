# BrainStorm – Multi-Game Platform: Projektübersicht

## Konzept

Eine Echtzeit-Spielshow-Plattform mit zwei separaten Frontends (Admin / Player) und einem generischen Go-Backend, das mehrere Spieltypen und parallele Rooms unterstützt. Kommunikation läuft über WebSockets; alle Clients bekommen den Spielstand in Echtzeit synchronisiert.

Aktuell implementierter Spieltyp: **Jeopardy** (weitere Typen können hinzugefügt werden ohne das generische Gerüst zu ändern).

---

## Architektur

```
games/
├── backend/
│   ├── game/
│   │   ├── core/         → Manager, Room, Player, Game-Interface, RoomPhase
│   │   └── jeopardy/     → Jeopardy-Implementierung + WS-Payloads
│   ├── ws/               → WebSocket-Handler, Hub, Message-Typen
│   ├── api/              → REST-Endpunkte + Auth-Middleware
│   ├── library/          → Quiz-Bibliothek (PostgreSQL-backed)
│   ├── media/            → Datei-Upload-Handler
│   ├── db/               → PostgreSQL-Verbindung + Migrations
│   └── cache/            → Redis-Client
├── admin-frontend/        → React + TypeScript + Vite (Moderator)
├── player-frontend/       → React + TypeScript + Vite (Teilnehmer)
├── Caddyfile              → Reverse Proxy + Basic Auth
└── docker-compose.yml     → Backend, Caddy, PostgreSQL, Redis
```

### Game-Interface (Backend)

```go
type Game interface {
    Type() GameType
    Snapshot() map[string]any
    HandleAdminCommand(cmd string, payload map[string]any) (any, error)
    HandlePlayerMessage(playerID, msgType string, payload map[string]any) error
    OnStart(room *Room) error
}
```

Neue Spieltypen implementieren dieses Interface und registrieren sich über `POST /api/rooms` / `POST /api/rooms/:code/game`.

### RoomPhase vs. GamePhase

| Typ | Werte | Zweck |
|---|---|---|
| `RoomPhase` (generisch) | `LOBBY`, `IN_PROGRESS`, `GAME_OVER` | Navigation in Frontends |
| `JeopardyPhase` (intern) | `QUESTION_OPEN`, `ACTIVE_PLAYER_ANSWERING`, `BUZZER_PHASE`, `QUESTION_DONE` | Jeopardy-interne Zustandsmaschine |

---

## Tech-Stack

| Bereich | Technologie |
|---|---|
| Backend | Go 1.24, nhooyr.io/websocket, net/http |
| Datenbank | PostgreSQL 16 (Quiz-Bibliothek) |
| Cache | Redis 7 (optional) |
| Admin-Frontend | React, TypeScript, Vite, Zustand, React Router v7 |
| Player-Frontend | React, TypeScript, Vite, Zustand, React Router v7 |
| Reverse Proxy | Caddy 2 (HTTP Basic Auth, statische Dateien, WS-Proxy) |
| Medien | Multipart HTTP-Upload, lokal gespeichert unter `/data/uploads` |

---

## Auth-Modell

Zwei unabhängige Auth-Ebenen:

| Ebene | Mechanismus | Schützt |
|---|---|---|
| Caddy | HTTP Basic Auth (`ADMIN_PASSWORD_HASH`) | `/admin/*` Frontend-Route |
| Go-Backend | Bearer Token (`ADMIN_TOKEN`) | Alle `/api/rooms/*` Routen + Library-Write-Routen (POST/PUT/DELETE) |

`GET /api/library` und `GET /api/library/:id` sind bewusst öffentlich (Lesezugriff auf Quiz-Katalog).

Das Admin-Frontend liest `VITE_ADMIN_TOKEN` zur Build-Zeit (via Vite env) und sendet ihn bei jedem API-Call als `Authorization: Bearer ...` Header.

---

## Room-System

- Mehrere Rooms parallel möglich; jeder hat einen eindeutigen **6-stelligen Code**
- Admin erstellt Room per `POST /api/rooms` mit `game_type`
- Spieltyp kann in der Lobby gewechselt werden (`POST /api/rooms/:code/game`)
- Room-State lebt in-memory (kein Persist; Rooms sterben mit dem Prozess)
- Reconnect-Handling: Spieler können mit gleichem Namen neu verbinden
- Automatischer Cleanup: leere/abgeschlossene Rooms werden nach Timeout entfernt

---

## WebSocket Message-Types

```
Client → Server:
  JOIN_GAME           { roomCode, playerName }
  BUZZ                {}
  WEBRTC_OFFER        { targetId, sdp }
  WEBRTC_ANSWER       { targetId, sdp }
  WEBRTC_ICE          { targetId, candidate }
  WEBRTC_PRESENCE     { enabled }

Server → All clients:
  GAME_STATE          { roomCode, board, scores, activePlayers, currentPhase,
                        game_type, room_phase, game_state }
  QUESTION_OPENED     { questionId, category, points, text, imageUrl?, audioUrl?, videoUrl? }
  ACTIVE_PLAYER       { playerId, playerName }
  BUZZER_OPEN         {}
  PLAYER_BUZZED       { playerId, playerName }
  ANSWER_RESULT       { playerId, correct, pointsDelta, newScore }
  ANSWER_REVEALED     { answer }
  BOARD_UPDATE        { questionId, played }
  GAME_OVER           { finalScores }
  GAME_SWITCHED       { game_type }
  TIMER               { endsAt, durationMs }
  TIMER_STOPPED       {}

Server → Admin only:
  PLAYER_JOINED       { playerId, playerName }
  PLAYER_LEFT         { playerId }
  WEBRTC_OFFER        { fromId, sdp }
  WEBRTC_ANSWER       { fromId, sdp }
  WEBRTC_ICE          { fromId, candidate }
  WEBRTC_PRESENCE     { playerId, enabled }

Server → Player clients only:
  ROOM_RESET          {}
```

> **GAME_STATE und Antworten:** Der Admin erhält den vollen Snapshot inkl. `answer`-Feldern. Player-Clients erhalten eine gesäuberte Version ohne Antworten.

---

## REST API

Alle `/api/rooms/*` Routen und Library-Write-Routen erfordern `Authorization: Bearer <ADMIN_TOKEN>`.

### Rooms

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/rooms` | Alle aktiven Rooms auflisten |
| `POST` | `/api/rooms` | Room erstellen (`game_type` pflicht) |
| `DELETE` | `/api/rooms/:code` | Room löschen |
| `GET` | `/api/rooms/:code` | Room-Snapshot |
| `POST` | `/api/rooms/:code/game` | Spieltyp wechseln (nur Lobby) |
| `POST` | `/api/rooms/:code/start` | Spiel starten |
| `POST` | `/api/rooms/:code/end` | Spiel beenden |

### Quiz (Jeopardy)

| Methode | Pfad | Beschreibung |
|---|---|---|
| `POST` | `/api/rooms/:code/quiz` | Quiz hochladen |
| `GET` | `/api/rooms/:code/export` | Quiz als JSON exportieren |
| `POST` | `/api/rooms/:code/quiz/library/:id` | Quiz aus Bibliothek laden |

### Spielsteuerung (Jeopardy)

| Methode | Pfad | Beschreibung |
|---|---|---|
| `POST` | `/api/rooms/:code/question/:id/open` | Frage öffnen |
| `POST` | `/api/rooms/:code/question/close` | Frage schließen |
| `POST` | `/api/rooms/:code/question/reveal` | Antwort aufdecken |
| `POST` | `/api/rooms/:code/question/end-buzzer` | Buzzer-Phase beenden |
| `POST` | `/api/rooms/:code/question/timer` | Timer starten/stoppen (`{ seconds: 30 }` / `{ seconds: 0 }`) |
| `POST` | `/api/rooms/:code/answer` | Antwort bewerten (`{ playerId, correct }`) |

### Spieler

| Methode | Pfad | Beschreibung |
|---|---|---|
| `POST` | `/api/rooms/:code/players/shuffle` | Reihenfolge zufällig |
| `POST` | `/api/rooms/:code/players/order` | Reihenfolge setzen |
| `DELETE` | `/api/rooms/:code/players/:id` | Spieler kicken |
| `POST` | `/api/rooms/:code/players/:id/score` | Score manuell setzen |

### Quiz-Bibliothek

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/api/library` | öffentlich | Alle Quizzes auflisten |
| `POST` | `/api/library` | Admin | Neues Quiz anlegen |
| `GET` | `/api/library/:id` | öffentlich | Quiz-Details abrufen |
| `PUT` | `/api/library/:id` | Admin | Quiz aktualisieren |
| `DELETE` | `/api/library/:id` | Admin | Quiz löschen |
| `POST` | `/api/library/from-room/:code` | Admin | Aktuelles Room-Quiz speichern |

### Medien

| Methode | Pfad | Beschreibung |
|---|---|---|
| `POST` | `/api/media/upload` | Datei hochladen (Bild, Audio, Video) |
| `GET` | `/media/:filename` | Hochgeladene Datei abrufen |

---

## Admin-Frontend

Erreichbar unter `/admin`. Alle Pfade sind relativ dazu.

### Startseite (`/`)
- Liste aller aktiven Rooms
- Room erstellen (Spieltyp wählen)
- Zu bestehendem Room navigieren

### Quiz-Builder (`/builder/jeopardy`)
- Kategorien + Fragen erstellen (Text, Bild, Audio, Video per Upload)
- Quiz exportieren / importieren (JSON)
- In Bibliothek speichern / aktualisieren
- Upload in den aktiven Room

### Quiz-Bibliothek (`/library`)
- Gespeicherte Quizzes anzeigen, bearbeiten, löschen
- Quiz in aktiven Room laden

### Lobby (`/rooms/:code/lobby`)
- Room-Code anzeigen + kopieren (+ QR-Code)
- Spieler live sehen, Reihenfolge per Drag & Drop
- Spiel starten

### Control Panel (`/rooms/:code/control`)
- Board-Ansicht: Frage auswählen
- Timer starten (15s / 30s / 60s) und stoppen
- Aktiven Spieler + Buzzer-Phase sehen
- Antwort als richtig/falsch bewerten (auch per Tastatur: Enter/Esc)
- Scores live + manuell korrigieren
- WebRTC-Kamera-Tiles der Spieler
- Spiel beenden

---

## Player-Frontend

Erreichbar unter `/` (Root).

### Join (`/`)
- Room-Code + Name eingeben → WebSocket-Verbindung

### Warteraum (`/waiting`)
- Warte auf Spielstart; navigiert automatisch zu `/game`

### Spielansicht (`/game`)
- Erkennt `game_type` aus `GAME_STATE` → lädt passende UI
- **Jeopardy-UI**: Board, Fragen-Overlay, Buzzer, Score-Strip, Timer-Balken
- Navigiert zu `/end` bei `room_phase → GAME_OVER`

### Endscreen (`/end`)
- Finale Rangliste mit Platzierung

---

## Jeopardy — Spielmechanik

### Ablauf
1. Moderator öffnet eine Frage vom Board (optional mit Timer)
2. Der **aktive Spieler** (reihum) antwortet — kein Buzzer nötig
3. Moderator bewertet: **richtig** → Punkte + nächste Frage; **falsch** → Buzzer-Phase

### Buzzer-Phase
- Alle anderen Spieler können buzzern
- Erster Buzzer darf antworten; Moderator bewertet erneut

### Punktesystem

| Ergebnis | Punkte |
|---|---|
| Aktiver Spieler richtig | + voller Fragenwert |
| Aktiver Spieler falsch | − halber Fragenwert |
| Buzzer richtig | + halber Fragenwert |
| Buzzer falsch | − halber Fragenwert |

### Timer
- Admin kann pro Frage einen Countdown starten (15s / 30s / 60s oder manuell stoppen)
- Timer läuft bei allen Clients synchron (serverzeit-basiert, reconnect-safe)
- Kein automatisches Schließen der Frage beim Timer-Ablauf — Admin entscheidet
