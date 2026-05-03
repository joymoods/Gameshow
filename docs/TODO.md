# BrainStorm – Projekt-Backlog

> Dieses Dokument beschreibt alle Aufgaben geordnet nach Phase und Bereich.
> Die ursprüngliche Jeopardy-App ist vollständig implementiert und auf Multi-Game-Architektur migriert.

---

## Phase 1 — Backend (Go) ✅

- [x] Go-Modul initialisieren, Abhängigkeiten (websocket, uuid)
- [x] `game/core/`: Manager, Room, Player, Game-Interface, RoomPhase
- [x] `game/jeopardy/`: JeopardyGame als Game-Interface-Implementierung
- [x] `ws/`: WebSocket-Handler, Hub, generische Message-Typen
- [x] `api/routes.go`: REST-Endpunkte (rooms, quiz, players, answer, game-switch, …)
- [x] `media/`: Datei-Upload-Handler + statischer File-Server
- [x] Multi-Room-Registry (parallele Rooms)
- [x] GAME_STATE-Payload um `game_type`, `room_phase`, `game_state` erweitert
- [x] `GAME_SWITCHED`-WS-Nachricht bei Spieltyp-Wechsel
- [x] `go build ./... && go vet ./...` fehlerfrei

---

## Phase 2 — Admin-Frontend (React + TypeScript + Vite) ✅

- [x] Quiz-Builder: Kategorien + Fragen erstellen, Medien hochladen, JSON-Export/Import
- [x] Lobby: Room-Code, Spieler, Drag & Drop Reihenfolge, Spiel starten
- [x] Control Panel: Board, Fragen öffnen, Buzzer, Antwort bewerten, Scores, Spiel beenden
- [x] Startseite: Room-Liste, Room erstellen mit Spieltyp-Auswahl
- [x] URL-basiertes Routing (`/rooms/:code/lobby`, `/rooms/:code/control`)
- [x] `lobbyStore`: activeRoomCode + Rooms-Liste
- [x] `gameType` + `roomPhase` im `gameStore`; `GAME_SWITCHED`-Handler
- [x] `npm run build` fehlerfrei

---

## Phase 3 — Player-Frontend (React + TypeScript + Vite) ✅

- [x] Join, Warteraum, Jeopardy-Spielansicht (Board + Buzzer + Score), Endscreen
- [x] Auto-Erkennung des Spieltyps aus `game_type` in GAME_STATE
- [x] Navigation auf `roomPhase` (`IN_PROGRESS` → `/game`, `GAME_OVER` → `/end`)
- [x] `JeopardyGame`-Komponente extrahiert; `GamePage` ist generischer Dispatcher
- [x] `GAME_SWITCHED`-Handler im Store
- [x] `npm run build` fehlerfrei

---

## Phase 4 — Design & Polish ✅

- [x] Design-System (CSS-Variablen: Farben, Fonts, Spacing)
- [x] Admin-Frontend vollständig gestylt
- [x] Player-Frontend vollständig gestylt (inkl. Buzzer-Feedback, Score-Animationen)
- [x] Animationen: Score-Delta-Flash, Fragen-Overlay, Buzzer-Feedback
- [x] Responsive: Player-Frontend funktioniert auf Mobilgeräten

---

## Phase 5 — Deployment-Vorbereitung ✅

- [x] Environment-Variablen für Backend-URL konfigurieren (`.env` in Frontends)
- [x] `docker-compose.yml` für lokales Setup (Backend + statische Frontends)
- [x] Caddy-Config für Reverse Proxy (Backend API + WebSocket + Frontend)
- [x] README mit Setup-Anleitung schreiben

---

## Post-Migration — Offene Punkte

### Backend
- [x] Room-Cleanup: abgeschlossene oder leere Rooms nach Timeout entfernen
- [x] Persist-Option: PostgreSQL-Datenbank + Redis-Cache eingeführt; Quiz-Bibliothek implementiert (GET/POST/PUT/DELETE /api/library)
- [ ] Zweiter Spieltyp implementieren (z.B. Quiz mit Multiple-Choice) als Proof-of-Concept

### Admin-Frontend
- [x] QR-Code generieren und anzeigen (statt Placeholder)
- [x] Bestätigung wenn Admin-Tab geschlossen wird während Spiel läuft
- [x] Builder: Fragen per Drag & Drop neu anordnen

### Player-Frontend
- [x] Sound-Effekte: Buzzer-Sound, richtig/falsch Feedback
- [x] Landscape-Optimierung für Mobilgeräte

### Allgemein
- [x] Abschluss-Manuelltest: vollständige Jeopardy-Runde (Join → Lobby → Spiel → End)
- [x] Auth für Admin-Frontend (einfacher PIN-Schutz reicht für Heimnetz)
- [x] Debugsession: 7 Bugs behoben (Antwort in QUESTION_OPENED, Quiz-Pflicht vor Start, closeQuestion-Guard, API-Responses, WaitingPage-Reaktivität)
- [x] Debugsession 2 (2026-04-28): 5 weitere Bugs behoben — `answer` nach GAME_STATE-Restore, WaitingPage ROOM_RESET-Navigation, reveal()-Error ohne aktive Frage, globales ResetPlayerClients beim Raum-Erstellen, WS-URL-Protokoll im Admin-Frontend; `PhaseLobby`-Konstante eingeführt
- [x] Debugsession 3 (2026-04-28): 4 Bugs behoben — Deadlock-Risiko (Lock-Order-Inversion r.mu/j.mu in Room.Snapshot), VITE_API_URL fehlend in HomePage.tsx und JoinPage.tsx, unnötiger setIdentity-Aufruf in buzz()
- [x] Debugsession 4 (2026-04-28): 2 Bugs behoben — (1) GAME_STATE leaked Antworten im Board an Player-Clients via WS (BroadcastGameState/handleJoinGame jetzt split: Admin full, Player public ohne answers); (2) handleSwitchGame überschrieb Quiz bei Wechsel auf denselben Spieltyp (guard: nur neues Game-Objekt wenn Typ sich ändert)
- [x] Admin-Timer: Admin kann Countdown-Timer manuell starten (15s/30s/60s) während eine Frage offen ist; Timer läuft bei allen Clients synchron; Stopp-Button für Admin; visuelle Anzeige in Admin-Panel und Player-Overlay; Timer-State im Snapshot (reconnect-safe)
