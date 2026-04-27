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
│   │   ├── core/         → Generische Typen: Manager, Room, Player, Game-Interface, RoomPhase
│   │   └── jeopardy/     → Jeopardy-Implementierung des Game-Interface + WS-Payloads
│   ├── ws/               → WebSocket-Handler, Hub, generische Message-Typen
│   ├── api/              → REST-Endpunkte (rooms, quiz, players, answer, …)
│   └── media/            → Datei-Upload-Handler
├── admin-frontend/        → React + TypeScript + Vite (Moderator)
└── player-frontend/       → React + TypeScript + Vite (Teilnehmer)
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
| `JeopardyPhase` (intern) | `QUESTION_OPEN`, `ACTIVE_PLAYER_ANSWERING`, … | Jeopardy-interne Zustandsmaschine |

---

## Tech-Stack

| Bereich | Technologie |
|---|---|
| Backend | Go 1.24, nhooyr.io/websocket, net/http |
| Admin-Frontend | React, TypeScript, Vite, Zustand, React Router v7 |
| Player-Frontend | React, TypeScript, Vite, Zustand, React Router v7 |
| State | In-Memory (kein DB für MVP) |
| Medien | Multipart HTTP-Upload, lokal gespeichert |

---

## Room-System

- Mehrere Rooms parallel möglich; jeder hat einen eindeutigen **6-stelligen Code**
- Admin erstellt Room per `POST /api/rooms` mit `game_type`
- `GET /api/rooms` listet alle aktiven Rooms
- Spieler treten per Room-Code bei
- Spieltyp kann in der Lobby gewechselt werden (`POST /api/rooms/:code/game`)
- Room-State lebt in-memory (kein Persist nötig für MVP)
- Reconnect-Handling: Spieler können mit gleichem Namen neu verbinden

---

## WebSocket Message-Types

```
Client → Server:
  JOIN_GAME           { roomCode, playerName }
  BUZZ                {}

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

Server → Admin only:
  PLAYER_JOINED       { playerId, playerName }
  PLAYER_LEFT         { playerId }

Server → Player clients only:
  ROOM_RESET          {}
```

---

## REST API

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/rooms` | Alle aktiven Rooms auflisten |
| `POST` | `/api/rooms` | Room erstellen (`game_type` pflicht) |
| `DELETE` | `/api/rooms/:code` | Room löschen |
| `GET` | `/api/rooms/:code` | Room-Snapshot (für Reconnect) |
| `POST` | `/api/rooms/:code/quiz` | Quiz hochladen (Jeopardy) |
| `GET` | `/api/rooms/:code/export` | Quiz als JSON exportieren |
| `POST` | `/api/rooms/:code/start` | Spiel starten |
| `POST` | `/api/rooms/:code/end` | Spiel beenden |
| `POST` | `/api/rooms/:code/game` | Spieltyp wechseln (nur Lobby) |
| `POST` | `/api/rooms/:code/question/:id/open` | Frage öffnen |
| `POST` | `/api/rooms/:code/question/close` | Frage schließen |
| `POST` | `/api/rooms/:code/question/reveal` | Antwort aufdecken |
| `POST` | `/api/rooms/:code/question/end-buzzer` | Buzzer-Phase beenden |
| `POST` | `/api/rooms/:code/answer` | Antwort bewerten |
| `POST` | `/api/rooms/:code/players/shuffle` | Reihenfolge zufällig |
| `POST` | `/api/rooms/:code/players/order` | Reihenfolge setzen |
| `POST` | `/api/rooms/:code/players/:id/score` | Score manuell setzen |
| `POST` | `/api/media/upload` | Medien hochladen |

---

## Admin-Frontend

### Startseite (`/`)
- Liste aller aktiven Rooms
- Room erstellen: Name + Spieltyp wählen
- Zu bestehendem Room navigieren

### Quiz-Builder (`/builder/jeopardy`)
- Kategorien + Fragen erstellen (Text, Bild, Audio, Video)
- Quiz exportieren / importieren (JSON)
- Upload in den aktiven Room

### Lobby (`/rooms/:code/lobby`)
- Room-Code anzeigen + kopieren
- Spieltyp anzeigen + wechseln (nur in Lobby möglich)
- Spieler live sehen, Reihenfolge per Drag & Drop
- Spiel starten

### Control Panel (`/rooms/:code/control`)
- Board-Ansicht: Frage auswählen
- Aktiven Spieler + Buzzer-Phase sehen
- Antwort als richtig/falsch bewerten
- Scores live + manuell korrigieren
- Spiel beenden

---

## Player-Frontend

### Join (`/`)
- Room-Code + Name eingeben → WebSocket-Verbindung

### Warteraum (`/waiting`)
- Warte auf Spielstart; navigiert automatisch zu `/game` wenn `room_phase → IN_PROGRESS`

### Spielansicht (`/game`)
- Erkennt `game_type` automatisch aus `GAME_STATE` → lädt passende UI
- **Jeopardy-UI**: Board, Fragen-Overlay, Buzzer, Score-Strip, Mini-Leaderboard
- Navigiert zu `/end` wenn `room_phase → GAME_OVER`

### Endscreen (`/end`)
- Finale Rangliste mit Platzierung

---

## Jeopardy — Spielmechanik

### Ablauf
1. Moderator öffnet eine Frage vom Board
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
