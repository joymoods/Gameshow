# BrainStorm – Projekt-Backlog

> Dieses Dokument beschreibt alle Aufgaben geordnet nach Phase und Bereich.

---

## Phase 1 — Backend (Go) ✅

- [x] Go-Modul, Abhängigkeiten (websocket, uuid)
- [x] `game/core/`: Manager, Room, Player, Game-Interface, RoomPhase
- [x] `game/jeopardy/`: JeopardyGame als Game-Interface-Implementierung
- [x] `ws/`: WebSocket-Handler, Hub, generische Message-Typen
- [x] `api/routes.go`: REST-Endpunkte (rooms, quiz, players, answer, game-switch, …)
- [x] `media/`: Datei-Upload-Handler + statischer File-Server
- [x] Multi-Room-Registry (parallele Rooms)
- [x] GAME_STATE-Payload: `game_type`, `room_phase`, `game_state`
- [x] `GAME_SWITCHED`-WS-Nachricht bei Spieltyp-Wechsel

---

## Phase 2 — Admin-Frontend ✅

- [x] Quiz-Builder: Kategorien + Fragen, Medien hochladen, JSON-Export/Import
- [x] Lobby: Room-Code, Spieler, Drag & Drop Reihenfolge, Spiel starten
- [x] Control Panel: Board, Fragen öffnen, Buzzer, Antwort bewerten, Scores, Spiel beenden
- [x] Startseite: Room-Liste, Room erstellen mit Spieltyp-Auswahl
- [x] URL-basiertes Routing (`/rooms/:code/lobby`, `/rooms/:code/control`)

---

## Phase 3 — Player-Frontend ✅

- [x] Join, Warteraum, Jeopardy-Spielansicht (Board + Buzzer + Score), Endscreen
- [x] Auto-Erkennung des Spieltyps aus `game_type`
- [x] Navigation auf `roomPhase` (`IN_PROGRESS` → `/game`, `GAME_OVER` → `/end`)
- [x] `GAME_SWITCHED`-Handler

---

## Phase 4 — Design & Polish ✅

- [x] Design-System (CSS-Variablen)
- [x] Admin- und Player-Frontend gestylt
- [x] Animationen: Score-Delta, Fragen-Overlay, Buzzer-Feedback
- [x] Responsive: Player-Frontend auf Mobilgeräten

---

## Phase 5 — Deployment ✅

- [x] `docker-compose.yml` mit Backend + Caddy + PostgreSQL + Redis
- [x] Caddy-Config: Reverse Proxy, statische Frontends, HTTP Basic Auth für `/admin/*`
- [x] README mit vollständiger Setup-Anleitung

---

## Phase 6 — Features & Bugfixes ✅

- [x] Room-Cleanup: abgeschlossene/leere Rooms nach Timeout
- [x] PostgreSQL + Redis: Quiz-Bibliothek (GET/POST/PUT/DELETE /api/library)
- [x] WebRTC: Kamera-Übertragung zwischen Admin und Spielern
- [x] Countdown-Timer: Admin startet/stoppt Timer pro Frage; synchron bei allen Clients
- [x] QR-Code in Lobby
- [x] Builder: Fragen per Drag & Drop neu anordnen
- [x] Sound-Effekte (Buzzer, richtig/falsch)
- [x] Bestätigung beim Schließen des Admin-Tabs während laufendem Spiel
- [x] Score manuell korrigieren (Klick auf Wert im Control Panel)
- [x] Spieler kicken aus der Lobby
- [x] Reconnect-Handling (gleicher Name = gleicher Spieler)
- [x] WS-Keepalive-Pings (verhindert Timeout-Drops)
- [x] Initial-State-Push bei WS-Connect (kein extra GET nötig)
- [x] Debugsession: 7 Bugs (QUESTION_OPENED-Antwort, Quiz-Pflicht vor Start, u.a.)
- [x] Debugsession 2 (2026-04-28): 5 Bugs — GAME_STATE-Restore, WaitingPage-Navigation, reveal()-Guard, ResetPlayerClients, WS-URL-Protokoll
- [x] Debugsession 3 (2026-04-28): 4 Bugs — Deadlock-Risiko (r.mu/j.mu), VITE_API_URL fehlend
- [x] Debugsession 4 (2026-04-28): Antworten nicht an Player-Clients leaken; Quiz-Wipe-Bug bei Spieltyp-Wechsel auf denselben Typ

---

## Phase 7 — Security-Härtung ✅ (2026-05-03)

- [x] P1: `GET /api/rooms` erfordert Bearer-Token (Antworten nicht öffentlich)
- [x] P2: Library-Write-Routen (POST/PUT/DELETE) erfordern Admin-Auth
- [x] P3: `/admin/*` hinter Caddy HTTP Basic Auth
- [x] P4: Generische Fehlermeldungen für unauthentifizierte Caller (kein Schema-Leak)
- [x] P5: `GET /api/library` bewusst öffentlich — dokumentiert
- [x] Auth-Middleware in `api/auth.go` mit Bearer-Token aus `ADMIN_TOKEN`-Env
- [x] Admin-Frontend: zentraler `apiFetch()`-Wrapper sendet Token bei jedem Request
- [x] Tests auf neue Auth-Header aktualisiert

---

## Phase 8 — Dev-Experience ✅ (2026-05-03)

- [x] `Makefile`: `make build`, `make build-admin`, `make build-player`, `make deploy`, `make sync-env`
- [x] `make sync-env` liest `ADMIN_TOKEN` aus Root-`.env` → schreibt `VITE_ADMIN_TOKEN` in `admin-frontend/.env`
- [x] Root `.env.example` mit Erklärungen + Erzeugungsbefehlen
- [x] `admin-frontend/.env.example` und `player-frontend/.env.example` vollständig dokumentiert
- [x] `.gitignore` bereinigt: dist-Ordner, `.env` in Frontends, OS-Dateien

---

## Offen

- [ ] Zweiter Spieltyp (z.B. Multiple-Choice) als Proof-of-Concept für das Game-Interface
- [ ] Persist-Option für Room-State (aktuell In-Memory; geht verloren bei Neustart)
- [ ] Automatischer Timer-Ablauf: optionale Aktion wenn Timer auf 0 läuft
- [ ] Testplan aktualisieren: Auth-Flow, Library, Timer, WebRTC-Abschnitte ergänzen
