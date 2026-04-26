# Multi-Game Platform – Migrationsplan

> Basis: Vollständige Analyse der Codebasis (Stand 2026-04-24)  
> Ziel: Von einer Jeopardy-Only-Plattform zu einer Jackbox-ähnlichen Multi-Game-Lobby

---

## 1. Room-Abstraktion im Backend

### Ausgangslage

`game/room.go` enthält heute direkt Jeopardy-spezifische Felder:

```go
type Room struct {
    Categories        []Category      // Jeopardy
    CurrentQuestion   *Question       // Jeopardy
    BuzzedPlayerID    string          // Jeopardy
    BuzzedPlayers     map[string]bool // Jeopardy
    Phase             GamePhase       // enthält QUESTION_OPEN, BUZZER_PHASE, …
}
```

Die `GamePhase`-Konstanten mischen generische Zustände (`LOBBY`, `GAME_OVER`) mit Jeopardy-spezifischen (`QUESTION_OPEN`, `BUZZER_PHASE`, `ACTIVE_PLAYER_ANSWERING`, `QUESTION_DONE`).

### Zielstruktur

**Room wird zum generischen Container.** Er kennt nur noch:

```go
// game/core/room.go
type RoomPhase string

const (
    RoomPhaseLobby      RoomPhase = "LOBBY"
    RoomPhaseInProgress RoomPhase = "IN_PROGRESS"
    RoomPhaseGameOver   RoomPhase = "GAME_OVER"
)

type Room struct {
    mu                sync.RWMutex
    Code              string
    Players           []*Player
    PlayerOrder       []string
    ActivePlayerIndex int
    Phase             RoomPhase
    GameType          GameType   // "jeopardy" | zukünftig: "quiz", "trivia", …
    Game              Game       // nil bis Spiel gewählt; Jeopardy-Implementierung
    CreatedAt         time.Time
}
```

**Game-Interface** kapselt alle spielspezifischen Operationen:

```go
// game/core/game.go
type GameType string

const (
    GameTypeJeopardy GameType = "jeopardy"
)

type Game interface {
    // Typ-Identifikation (für GAME_STATE-Payload)
    Type() GameType

    // Spielspezifischer State für GAME_STATE-Broadcast
    Snapshot() map[string]any

    // Admin-Kommandos (open question, answer correct/wrong, reveal, …)
    HandleAdminCommand(cmd string, payload map[string]any) (any, error)

    // Optionale WS-Nachrichten vom Player (z.B. BUZZ)
    HandlePlayerMessage(playerID string, msgType string, payload map[string]any) error

    // Einstiegspunkt wenn Spiel startet (Phase LOBBY → IN_PROGRESS)
    OnStart(room *Room) error
}
```

**Begründung für Interface statt Embedding:**
- Jeopardy, ein zukünftiges Quiz-Spiel und ein Zeichenspiel haben vollständig unterschiedliche Zustandsmaschinen. Ein gemeinsames Basis-Struct würde sofort zu leeren Feldern oder Nil-Guards führen.
- Das Interface erzwingt keine Implementierungsdetails – jedes Spiel definiert seine eigene Phase-Logik intern.
- Der Hub und die API müssen das konkrete Spiel nicht kennen; sie delegieren an `room.Game`.

**Manager wird zur Room-Registry:**

```go
// game/core/manager.go
type Manager struct {
    mu    sync.RWMutex
    rooms map[string]*Room
}

func (m *Manager) CreateRoom(gameType GameType) (*Room, error)
func (m *Manager) GetRoom(code string) (*Room, bool)
func (m *Manager) DeleteRoom(code string)
func (m *Manager) ListRooms() []*Room
```

Der heutige `Manager` hält nur einen einzigen `*Room`. Die Registry ersetzt das.

---

## 2. Ordner- und Package-Struktur

### Nach der Migration

```
backend/
├── main.go
├── go.mod                     # Modul umbenennen: "jeopardy" → "games"
│
├── api/
│   ├── routes.go              # Generische Routes: Room-CRUD, Player-Management
│   └── jeopardy/
│       └── routes.go          # Jeopardy-spezifische Routes (quiz upload, question control, answer)
│
├── game/
│   ├── core/
│   │   ├── game.go            # Game-Interface + GameType-Konstanten
│   │   ├── room.go            # Room-Struct (generisch, ohne Spielfelder)
│   │   ├── player.go          # Player-Struct (ausgelagert aus room.go)
│   │   └── manager.go         # Room-Registry (map[code]*Room)
│   │
│   └── jeopardy/
│       ├── jeopardy.go        # Game-Interface-Implementierung
│       ├── question.go        # Question, Category (unverändert aus game/question.go)
│       └── phases.go          # Jeopardy-interne Phase-Konstanten (QUESTION_OPEN, …)
│
├── ws/
│   ├── hub.go                 # Weitgehend unverändert
│   ├── handler.go             # Delegiert Player-Messages an room.Game.HandlePlayerMessage()
│   └── messages.go            # Ergänzt: game_type im GAME_STATE-Payload
│
└── media/
    └── upload.go              # Unverändert
```

### Frontends

```
admin-frontend/src/
├── pages/
│   ├── HomePage.tsx           # NEU: Room-Liste + "Neue Lobby erstellen"
│   ├── LobbyPage.tsx          # Erweitert: Game-Typ-Anzeige, Wechsel-Button
│   ├── ControlPage.tsx        # Bleibt Jeopardy-spezifisch (vorerst)
│   └── games/
│       └── jeopardy/
│           └── BuilderPage.tsx   # Verschoben: standalone, kein Room nötig
├── store/
│   ├── lobbyStore.ts          # NEU: Room-Liste, aktiver Room-Code
│   └── gameStore.ts           # Erweitert: gameType-Feld
└── types/
    └── index.ts               # Erweitert: GameType, RoomPhase

player-frontend/src/
├── pages/
│   ├── JoinPage.tsx           # Minimal-Änderung: room_code bleibt
│   ├── WaitingPage.tsx        # Unverändert
│   ├── GamePage.tsx           # Wird zum Dispatcher (lädt Spiel-UI)
│   ├── EndPage.tsx            # Unverändert
│   └── games/
│       └── jeopardy/
│           └── JeopardyGame.tsx  # Extrahiert aus GamePage.tsx
└── store/
    └── gameStore.ts           # Erweitert: gameType-Feld
```

---

## 3. WebSocket-Messages und REST-Endpoints

### Neue / geänderte REST-Endpoints

| Methode | Endpoint | Änderung | Beschreibung |
|---------|----------|----------|--------------|
| `POST` | `/api/rooms` | **Geändert** | Body: `{"game_type": "jeopardy"}` → Room mit Game-Typ erstellen |
| `GET` | `/api/rooms` | **NEU** | Liste aller aktiven Rooms (für Admin-Home) |
| `GET` | `/api/rooms/:code` | Erweitert | RoomSnapshot enthält jetzt `game_type` |
| `POST` | `/api/rooms/:code/game` | **NEU** | `{"game_type": "jeopardy"}` → Spiel wechseln (nur in LOBBY-Phase) |
| `POST` | `/api/rooms/:code/quiz` | Unverändert | Bleibt Jeopardy-spezifisch unter `/api/rooms/:code/jeopardy/quiz` (nach Migration) |
| `POST` | `/api/rooms/:code/question/:id/open` | Unverändert | Delegation an `room.Game.HandleAdminCommand("open_question", …)` |
| alle anderen | `/api/rooms/:code/…` | Unverändert | Internen Routing-Pfad ändert sich, URL-Vertrag bleibt |

**Begründung:** URL-Vertrag bleibt für alle spielspezifischen Endpoints erhalten (kein Breaking Change für die Frontends während der Migration). Nur `POST /api/rooms` bekommt einen neuen Pflicht-Body.

### WebSocket-Protokoll

**GAME_STATE** (bestehende Message, erweiterter Payload):

```json
{
  "type": "GAME_STATE",
  "payload": {
    "game_type": "jeopardy",
    "room_phase": "IN_PROGRESS",
    "scores": [...],
    "player_order": [...],
    "game_state": {
      // spielspezifisch – Inhalt von Game.Snapshot()
      "board": [...],
      "current_phase": "BUZZER_PHASE",
      "current_question": {...}
    }
  }
}
```

**Neue Message: `GAME_SWITCHED`** (Server → alle Clients):

```json
{
  "type": "GAME_SWITCHED",
  "payload": {
    "game_type": "jeopardy"
  }
}
```

Wird gesendet, wenn der Admin das Spiel in einer aktiven Lobby wechselt. Player-Frontend reagiert mit UI-Reload des Game-Dispatchers.

**Unverändert bleiben:** `JOIN_GAME`, `BUZZ`, `QUESTION_OPENED`, `PLAYER_BUZZED`, `ANSWER_RESULT`, `BOARD_UPDATE`, `GAME_OVER`, `PLAYER_JOINED`, `PLAYER_LEFT`, `ERROR`, `ROOM_RESET`

**Begründung:** Jeopardy-spezifische WS-Messages bleiben erhalten, weil das Player-Frontend sie weiterhin konsumiert. Nur `GAME_STATE` bekommt das neue Dach-Feld `game_type` + `room_phase`, damit das Player-Frontend beim initialen Join sofort die richtige UI laden kann.

---

## 4. Admin-Frontend-Flow

### Aktueller Flow (linear, Jeopardy-hardcoded)

```
/ (BuilderPage) → /lobby (LobbyPage) → /control (ControlPage)
```

### Neuer Flow

```
/ (HomePage)
  ├── "Neue Lobby erstellen" → Game-Typ wählen → /rooms/:code/lobby
  └── bestehende Lobby wählen → /rooms/:code/lobby oder /rooms/:code/control

/builder/jeopardy         ← Board Builder, kein Room nötig
/rooms/:code/lobby        ← Lobby-Management (Player, Order, Game-Typ-Wechsel)
/rooms/:code/control      ← Spielsteuerung (Jeopardy-spezifisch, vorerst)
```

**Konkrete Änderungen:**

1. **HomePage (neu):** Zeigt alle aktiven Rooms per `GET /api/rooms`. Button „Neue Lobby" öffnet Modal mit Game-Typ-Auswahl (Dropdown). Erstellt Room per `POST /api/rooms` mit `game_type`.

2. **Board Builder ohne Lobby:** `BuilderPage` bekommt eine eigene Route `/builder/jeopardy`. Der Button „Quiz hochladen" bleibt – er schaut nach dem aktiven Room-Code im `lobbyStore`. Wenn kein Room aktiv ist, zeigt er einen Hinweis. So kann der Mod Boards vorbereiten, ohne eine laufende Session zu benötigen.

3. **LobbyPage – Game-Typ-Wechsel:** Neues Dropdown „Aktives Spiel" neben dem Room-Code. Beim Wechsel: `POST /api/rooms/:code/game`. Nur aktiv in Phase `LOBBY`. Wenn Spiel bereits läuft: Button disabled + Tooltip „Spiel läuft bereits".

4. **Room-Code im URL:** Alle room-scoped Pages arbeiten mit `:code` aus dem URL-Parameter. Das erlaubt Bookmarks und verhindert, dass Admin-State im Memory verloren geht bei Reload.

5. **lobbyStore (neu):** Kleiner Zustand (`activeRoomCode`, `rooms[]`). Wird beim ersten `GET /api/rooms` befüllt.

---

## 5. Player-Frontend: Automatische Spiel-Erkennung

### Mechanismus

Der Player-Frontend muss das Spiel nicht kennen, bevor er joined. Er verbindet sich, sendet `JOIN_GAME`, und erhält `GAME_STATE` mit `game_type` im Payload.

**GamePage wird zum Dispatcher:**

```tsx
// pages/GamePage.tsx
const gameType = useGameStore(state => state.gameType)

switch (gameType) {
  case 'jeopardy': return <JeopardyGame />
  // zukünftig: case 'quiz': return <QuizGame />
  default: return <UnknownGameFallback />
}
```

**Store-Erweiterung:**

```typescript
interface GameState {
  gameType: GameType | null   // NEU: aus GAME_STATE.game_type gesetzt
  roomPhase: RoomPhase | null // NEU: aus GAME_STATE.room_phase gesetzt
  // … alle bisherigen Felder bleiben
}
```

`GAME_STATE`-Handler setzt `gameType` und `roomPhase` aus dem neuen Payload-Format.

**`GAME_SWITCHED`-Handler:**

```typescript
case 'GAME_SWITCHED':
  set({ gameType: payload.game_type })
  // React re-rendert GamePage, Dispatcher wechselt die UI
```

**WaitingPage und EndPage** bleiben komplett generisch – sie zeigen Spieler-Listen und Scores, die unabhängig vom Spiel-Typ sind.

**Routing bleibt unverändert:** `/` → `/waiting` → `/game` → `/end`. Die Navigationslogik in den Pages reagiert auf `roomPhase` statt auf die bisherigen Jeopardy-Phasen.

**Begründung:** Der Dispatcher-Ansatz in `GamePage` ist die minimale Änderung. Der Routing-Tree, der Store-Shape und alle WS-Handler außerhalb von GamePage bleiben identisch. Neue Spiele werden durch eine neue `case`-Zeile und eine neue Komponente hinzugefügt – kein Refactoring bestehender Logik.

---

## 6. Migrationsreihenfolge

Die Reihenfolge ist so gewählt, dass Jeopardy nach jedem Schritt vollständig spielbar bleibt.

### Phase 1 – Backend: Multi-Room Registry (kein Breaking Change)

**Ziel:** Mehrere Rooms parallel möglich. Bestehende Jeopardy-Logik unverändert.

- `game/core/manager.go`: `map[string]*Room` statt eines einzigen `*Room`
- Alle API-Handler bekommen Room via `manager.GetRoom(code)` statt direktem Feld-Zugriff
- `POST /api/rooms` erstellt einen Room (noch ohne `game_type`-Body-Pflicht)
- `GET /api/rooms` neu einführen
- `Room.Code` wird zu URL-Parameter in allen Endpoints (war bereits der Fall, aber jetzt wirklich aus Registry gelesen)
- **Jeopardy:** Alle Felder bleiben direkt in Room – noch kein Interface

### Phase 2 – Backend: Game-Interface + Jeopardy-Package

**Ziel:** Jeopardy-Logik ins eigene Package isolieren, Room generisch machen.

- `game/core/game.go`: `Game`-Interface definieren
- `game/jeopardy/jeopardy.go`: `JeopardyGame` implementiert Interface
  - Interne Felder: Categories, CurrentQuestion, BuzzedPlayers, interne Phase-Konstanten
  - `HandleAdminCommand()`: alle bisherigen API-Handler-Aktionen
  - `HandlePlayerMessage()`: BUZZ-Logik
  - `Snapshot()`: Board, current_phase, current_question
- `game/core/room.go`: Jeopardy-Felder entfernen, `Game Game` hinzufügen
- API-Handler: Aktionen an `room.Game.HandleAdminCommand()` delegieren
- WS-Handler: BUZZ-Message an `room.Game.HandlePlayerMessage()` delegieren
- **go.mod**: Modul von `jeopardy` → `games` umbenennen (alle Imports anpassen)
- **Jeopardy:** Vollständig spielbar über Interface

### Phase 3 – Backend: Protokoll-Erweiterung

**Ziel:** `game_type` im WS-Protokoll; Spiel-Wechsel-Endpoint.

- `GAME_STATE`-Payload: `game_type` + `room_phase` ergänzen (additiv, kein Breaking Change)
- `RoomPhase`: `LOBBY`, `IN_PROGRESS`, `GAME_OVER` einführen; Mapping von Jeopardy-internen Phasen auf RoomPhase für den generischen Teil des Payloads
- `POST /api/rooms`: `game_type` als Pflichtfeld im Body
- `POST /api/rooms/:code/game`: Spiel wechseln (nur in LOBBY-Phase)
- WS-Message `GAME_SWITCHED` einführen

### Phase 4 – Admin-Frontend: Multi-Room + Game-Auswahl

**Ziel:** Admin kann Rooms erstellen, Game-Typ wählen, Board Builder unabhängig nutzen.

- `lobbyStore.ts` einführen
- `HomePage.tsx` mit Room-Liste und Erstellungs-Modal
- `BuilderPage` → `/builder/jeopardy` entkoppeln
- `LobbyPage`: Game-Typ-Dropdown + Wechsel-Button über neuen Endpoint
- Router: neue Routes einhängen, bestehende Jeopardy-Routes weiter pflegen
- **Jeopardy:** Admin-Flow vollständig, Spiel weiter spielbar

### Phase 5 – Player-Frontend: Auto-Erkennung

**Ziel:** Spieler-Frontend erkennt Spiel automatisch und lädt die richtige UI.

- `gameStore`: `gameType`, `roomPhase` Felder ergänzen
- `GAME_STATE`-Handler: neue Felder setzen
- `GAME_SWITCHED`-Handler: neu einführen
- `GamePage` → Dispatcher: `JeopardyGame`-Komponente extrahieren
- `App.tsx`-Navigation: auf `roomPhase` statt Jeopardy-Phasen reagieren
- **Jeopardy:** Vollständig über `JeopardyGame`-Komponente verfügbar

### Phase 6 – Aufräumen

**Ziel:** Keine Jeopardy-Reste im generischen Code.

- `game/question.go` (alter Pfad) löschen
- Alle verbleibenden Jeopardy-Importe aus `game/core/` entfernen
- `ws/messages.go`: Payload-Typen die Jeopardy-spezifisch waren in `game/jeopardy/` verschieben
- `docs/PROJECT_OVERVIEW.md` aktualisieren
- `docs/TODO.md` aktualisieren
- `go.mod` final prüfen

---

## Architekturentscheidungen – Zusammenfassung

| Entscheidung | Alternative | Begründung |
|---|---|---|
| `Game`-Interface (nicht Embedding) | Basis-Struct mit Overrides | Spiele haben fundamentell unterschiedliche State-Maschinen; Interface erzwingt klare Grenzen |
| `game_type` in `GAME_STATE` statt eigenem Handshake | Separater `GET_GAME_TYPE`-Request | Minimale Latenz beim Join; Player erhält alle nötigen Infos in einer einzigen Nachricht |
| Dispatcher in `GamePage` (Switch-Statement) | Dynamischer Import / Lazy Loading | Für 2–5 Spiele ist Lazy Loading Over-Engineering; Switch ist lesbar und typsicher |
| URL-basierter Room-Code im Admin | Globaler Store | Reload-sicher, Bookmark-fähig, kein Ghost-State bei Tab-Wechsel |
| Jeopardy-interne Phasen bleiben intern | Eine flache Phase-Liste für alle Spiele | Andere Spiele werden andere Phasen haben; generische `RoomPhase` (3 Zustände) + spielspezifische Unter-Phasen in `Snapshot()` ist die sauberere Grenze |
| `HandleAdminCommand` mit string + map | Typisierte Command-Structs | Einfacher zu starten; kann später mit einem `encoding/json` + type-switch typisiert werden, ohne Interface zu brechen |
