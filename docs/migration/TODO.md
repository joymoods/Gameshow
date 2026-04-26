# Multi-Game Platform – Migrations-TODO

> Jeopardy bleibt nach jedem abgeschlossenen Block vollständig spielbar.  
> Reihenfolge innerhalb jedes Blocks ist bindend (Abhängigkeiten beachten).

---

## Phase 1 – Backend: Multi-Room Registry

Ziel: Mehrere Rooms parallel möglich. Kein Breaking Change an Jeopardy.

- [x] `game/core/manager.go` anlegen: `Manager` mit `map[string]*Room` statt einzelnem `*Room`
- [x] `game/core/player.go` anlegen: `Player`-Struct aus `game/room.go` auslagern
- [x] `game/core/room.go` anlegen: `Room`-Struct (noch mit Jeopardy-Feldern, Phase-Typ wie bisher)
- [x] `game/game.go` (alter Manager) auf neuen `core.Manager` umstellen
- [x] Alle API-Handler in `api/routes.go`: Room-Zugriff via `manager.GetRoom(code)` statt direktem Feld
- [x] `GET /api/rooms` Endpoint einführen (gibt `[]RoomSnapshot` zurück)
- [x] `POST /api/rooms` bleibt, erstellt Room ohne `game_type`-Pflicht (Vorbereitung)
- [x] Manueller Test: Jeopardy end-to-end spielbar

---

## Phase 2 – Backend: Game-Interface + Jeopardy-Package

Ziel: Jeopardy-Logik ins eigene Package; Room generisch.

- [x] `game/core/game.go` anlegen: `Game`-Interface + `GameType`-Typ + Konstante `GameTypeJeopardy`
- [x] `game/core/room.go`: Felder `GameType GameType` + `Game Game` ergänzen; Jeopardy-Felder noch drin lassen (Parallel-Betrieb)
- [x] `game/jeopardy/` Verzeichnis anlegen
- [x] `game/jeopardy/question.go`: `Question`, `Category` aus `game/question.go` kopieren (nicht löschen)
- [x] `game/jeopardy/phases.go`: Jeopardy-interne Phase-Konstanten (`QUESTION_OPEN`, `BUZZER_PHASE`, …) anlegen
- [x] `game/jeopardy/jeopardy.go`: `JeopardyGame`-Struct anlegen, `Game`-Interface implementieren
  - [x] `Type() GameType`
  - [x] `Snapshot() map[string]any` (Board, current_phase, current_question)
  - [x] `HandleAdminCommand(cmd string, payload map[string]any)` (open_question, answer, reveal, close, end_buzzer)
  - [x] `HandlePlayerMessage(playerID string, msgType string, payload map[string]any)` (BUZZ-Logik)
  - [x] `OnStart(room *Room) error`
- [x] API-Handler: alle Jeopardy-Aktionen an `room.Game.HandleAdminCommand()` delegieren
- [x] WS-Handler (`ws/handler.go`): BUZZ-Message an `room.Game.HandlePlayerMessage()` delegieren
- [x] `go.mod`: Modul-Name von `jeopardy` → `games` ändern
- [x] Alle `import "jeopardy/..."` → `"games/..."` anpassen (Backend + ggf. Tools)
- [x] Alte Jeopardy-Felder aus `game/core/room.go` entfernen (erst nach erfolgreicher Delegation)
- [x] `game/question.go` (alter Pfad) löschen
- [x] Manueller Test: Jeopardy vollständig über Interface spielbar

---

## Phase 3 – Backend: Protokoll-Erweiterung

Ziel: `game_type` im WS-Protokoll; Spiel-Wechsel-Endpoint.

- [x] `game/core/room.go`: `RoomPhase`-Typ anlegen (`LOBBY`, `IN_PROGRESS`, `GAME_OVER`)
- [x] `Room`-Methode `RoomPhase()` implementieren: mappt interne Game-Phase auf generische RoomPhase (`GetPhase()`/`SetPhase()` + Phase-Feld)
- [x] `ws/messages.go`: `GameStatePayload` um `GameType string` + `RoomPhase string` + `GameState map[string]any` erweitern (in `RoomSnapshot`, additiv)
- [x] `BroadcastGameState()` in `ws/handler.go`: neue Payload-Felder befüllen (`room.GameType`, `room.Phase`, `room.Game.Snapshot()`) – via erweitertem `Room.Snapshot()`
- [x] `POST /api/rooms`: `game_type` als Pflichtfeld im Request-Body einführen; Room mit `JeopardyGame` initialisieren
- [x] `POST /api/rooms/:code/game` Endpoint anlegen: Spiel wechseln (nur wenn `RoomPhase == LOBBY`); sendet `GAME_SWITCHED` WS-Message
- [x] `ws/messages.go`: `MsgGameSwitched = "GAME_SWITCHED"` + Payload-Typ anlegen
- [ ] Manueller Test: GAME_STATE-Payload enthält `game_type: "jeopardy"` und `room_phase`; Jeopardy spielbar

---

## Phase 4 – Admin-Frontend: Multi-Room + Game-Auswahl

Ziel: Room erstellen, Game-Typ wählen, Board Builder unabhängig nutzbar.

- [x] `src/types/index.ts`: `GameType`, `RoomPhase` ergänzen; `GameStatePayload` um neue Felder erweitern; `RoomInfo`, `GameSwitchedPayload`, `MSG.GAME_SWITCHED` hinzugefügt
- [x] `src/store/lobbyStore.ts` anlegen: `activeRoomCode`, `rooms[]`, Actions `fetchRooms`, `setActiveRoom`
- [x] `src/pages/HomePage.tsx` anlegen: Room-Liste via `GET /api/rooms`; Modal „Neue Lobby" mit Game-Typ-Dropdown; `POST /api/rooms` mit `game_type`
- [x] `src/App.tsx`: Route `/` → `HomePage`, neue Routen `/builder/jeopardy`, `/rooms/:code/lobby`, `/rooms/:code/control`; Legacy-Redirects für `/lobby` und `/control`
- [x] `src/pages/BuilderPage.tsx` → `src/pages/games/jeopardy/BuilderPage.tsx` verschoben; Route `/builder/jeopardy` ohne Room-Code; Upload nutzt `lobbyStore.activeRoomCode`; altes File ist Re-Export
- [x] `src/pages/LobbyPage.tsx`: Room-Code aus URL-Param (`useParams`); initiales Fetch + Laden in gameStore; Game-Typ-Anzeige + Wechsel-Dropdown (`POST /api/rooms/:code/game`); Wechsel-Button disabled wenn `roomPhase !== 'LOBBY'`
- [x] `src/store/gameStore.ts`: `gameType`, `roomPhase` Felder ergänzt; GAME_STATE-Handler und neuer GAME_SWITCHED-Handler
- [x] Nav-Bar: Room-Code aus URL-Param oder lobbyStore; ControlRoute-Wrapper für Spiel-beenden-Button
- [ ] Manueller Test: Room erstellen, Jeopardy als Typ wählen, Board bauen, Lobby starten, Spiel spielen

---

## Phase 5 – Player-Frontend: Auto-Erkennung

Ziel: Player erkennt Spiel-Typ automatisch; richtige UI lädt ohne manuellen Eingriff.

- [x] `src/types/index.ts`: `GameType`, `RoomPhase` ergänzen; `GameStatePayload` erweitern
- [x] `src/store/gameStore.ts`: `gameType: GameType | null`, `roomPhase: RoomPhase | null` Felder ergänzen
- [x] `GAME_STATE`-Handler: `gameType` + `roomPhase` aus neuem Payload setzen; Navigation auf `roomPhase` statt Jeopardy-Phasen umstellen
- [x] `GAME_SWITCHED`-Handler anlegen: `gameType` im Store aktualisieren
- [x] `src/pages/games/jeopardy/JeopardyGame.tsx` anlegen: Jeopardy-spezifischer UI-Teil aus `GamePage.tsx` extrahieren (Frage, Buzzer, Board, Score)
- [x] `src/pages/GamePage.tsx`: Dispatcher mit `switch(gameType)` → `<JeopardyGame />`; Fallback für unbekannte `gameType`
- [x] `src/App.tsx`: Navigationslogik von Jeopardy-Phasen auf `roomPhase` (`IN_PROGRESS` → `/game`, `GAME_OVER` → `/end`) umstellen
- [ ] Manueller Test: Player joined, GAME_STATE kommt mit `game_type: "jeopardy"`, JeopardyGame-UI erscheint; Buzzer und Scoring funktionieren

---

## Phase 6 – Aufräumen

Ziel: Keine Jeopardy-Reste im generischen Code; Dokumentation aktuell.

- [x] Backend: verbleibende alte `game/room.go`, `game/game.go` (nicht core/) Dateien löschen falls nicht bereits geschehen
- [x] Backend: `ws/messages.go` – Payload-Typen die Jeopardy-spezifisch sind (z.B. `QuestionOpenedPayload`) nach `game/jeopardy/` oder `api/jeopardy/` verschieben
- [x] Backend: `go build ./...` ohne Warnings/Errors bestätigen
- [x] Admin-Frontend: ungenutzte Imports + alte Route-Referenzen bereinigen; `npm run build` fehlerfrei
- [x] Player-Frontend: ungenutzte Imports bereinigen; `npm run build` fehlerfrei
- [x] `docs/PROJECT_OVERVIEW.md` auf Multi-Game-Architektur aktualisieren
- [x] `docs/TODO.md` (Projekt-Backlog, nicht diese Datei): erledigte Migration-Items markieren, neue Post-Migration-Items ergänzen
- [ ] Abschluss-Test: vollständige Jeopardy-Runde (Join → Lobby → Spiel → End) in allen Frontends
