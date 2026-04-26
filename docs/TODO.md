# Jeopardy Quiz App — TODO

> Dieses Dokument beschreibt alle Aufgaben geordnet nach Phase und Bereich.
> Für Claude Code: Arbeite die Punkte der Reihe nach ab. Jede Phase baut auf der vorherigen auf.

---

## Phase 1 — Backend (Go)

### Projektstruktur aufsetzen
- [x] Go-Modul initialisieren (`go mod init`)
- [x] Abhängigkeiten hinzufügen: `nhooyr.io/websocket`, `github.com/google/uuid`
- [x] Ordnerstruktur anlegen:
  ```
  backend/
  ├── main.go
  ├── game/
  │   ├── room.go        → Room-State, Player-Management
  │   ├── game.go        → Spiellogik (Runden, Buzzer, Punkte)
  │   └── question.go    → Fragetypen, Kategorien
  ├── ws/
  │   ├── handler.go     → WebSocket-Handler, Message-Routing
  │   ├── hub.go         → Hub, Client, Broadcast
  │   └── messages.go    → Message-Typen + Konstanten
  ├── api/
  │   └── routes.go      → REST-Endpunkte
  └── media/
      └── upload.go      → Datei-Upload-Handler
  ```

### Datenmodelle definieren (`game/`)
- [x] `Question` struct: ID, CategoryID, Points, Text, ImageURL, AudioURL, VideoURL
- [x] `Category` struct: ID, Name, Questions []Question
- [x] `Player` struct: ID, Name, Score int, Connected bool
- [x] `Room` struct: Code, Players, Categories, Board (welche Fragen gespielt), Phase, ActivePlayerIndex
- [x] `GamePhase` enum: `LOBBY`, `QUESTION_OPEN`, `ACTIVE_PLAYER_ANSWERING`, `BUZZER_PHASE`, `GAME_OVER`

### WebSocket-Handler (`ws/`)
- [x] Upgrade-Handler implementieren (HTTP → WebSocket)
- [x] Message-Typen als Go-Structs mit JSON-Tags definieren (alle aus der Übersicht)
- [x] Message-Router: eingehende Nachrichten auf Handler-Funktionen mappen
- [x] Broadcast-Funktion: Nachricht an alle Clients in einem Room senden
- [x] Admin-Only-Broadcast: Nachricht nur an den Admin-Client senden
- [x] Disconnect-Handling: Player als disconnected markieren, Room ggf. bereinigen

### Spiellogik (`game/`)
- [x] Room erstellen mit zufälligem 6-stelligem Code
- [x] Spieler beitreten (JOIN_GAME)
- [x] Spiel starten (Reihenfolge festlegen, Phase → QUESTION_OPEN)
- [x] Frage öffnen: Moderator wählt Frage → alle Clients bekommen QUESTION_OPENED
- [x] Aktiven Spieler ermitteln und ACTIVE_PLAYER broadcasten
- [x] Antwort bewerten (richtig/falsch):
  - Richtig: +voller Punktwert, nächste Runde
  - Falsch: -halber Punktwert, Buzzer-Phase öffnen oder nächster Spieler
- [x] Buzzer-Phase:
  - Phase → BUZZER_PHASE setzen
  - Ersten eingehenden BUZZ verarbeiten, Rest ignorieren
  - PLAYER_BUZZED broadcasten
  - Antwort bewerten → selbe Logik wie oben
- [x] Spielende erkennen (alle Fragen gespielt) → GAME_OVER broadcasten
- [x] Score manuell anpassen (Admin-Only REST-Endpunkt)

### REST API (`api/`)
- [x] `POST /api/rooms` → Room erstellen, Code zurückgeben
- [x] `GET /api/rooms/:code` → Room-State abrufen (für Admin-Reconnect)
- [x] `POST /api/rooms/:code/quiz` → Quiz (Kategorien + Fragen) hochladen (JSON)
- [x] `POST /api/rooms/:code/players/:id/score` → Score manuell setzen
- [x] `GET /api/rooms/:code/export` → Quiz als JSON exportieren
- [x] CORS-Header für lokale Entwicklung setzen

### Medien-Upload (`media/`)
- [x] `POST /api/media/upload` → Multipart-Upload, Datei lokal speichern
- [x] Statischen File-Server für `/media/` einrichten
- [x] Validierung: nur erlaubte Dateitypen (jpg, png, gif, webp, mp3, wav, ogg, mp4, webm)
- [x] Eindeutige Dateinamen generieren (UUID-basiert)

---

## Phase 2 — Admin-Frontend (React + TypeScript + Vite)

### Projektstruktur aufsetzen
- [x] Vite-Projekt initialisieren (`npm create vite@latest admin-frontend -- --template react-ts`)
- [x] Abhängigkeiten installieren: React Router, Zustand, uuid
- [x] Ordnerstruktur:
  ```
  admin-frontend/
  ├── src/
  │   ├── pages/
  │   │   ├── BuilderPage.tsx     → Quiz-Builder (inkl. QuestionEditor)
  │   │   ├── LobbyPage.tsx       → Lobby / Warteraum
  │   │   └── ControlPage.tsx     → Control Panel (live)
  │   ├── store/
  │   │   └── gameStore.ts        → Zustand-Store für Game-State
  │   ├── ws/
  │   │   └── socket.ts           → WebSocket-Client, Message-Handler
  │   └── types/
  │       └── index.ts            → Gemeinsame TypeScript-Types
  ```

### WebSocket-Client (`ws/socket.ts`)
- [x] Verbindung zum Backend aufbauen
- [x] Reconnect-Logik (exponentieller Backoff)
- [x] Eingehende Messages auf Store-Updates mappen
- [x] Ausgehende Messages: typisierte Send-Funktionen

### Quiz-Builder (`BuilderPage.tsx`)
- [x] Kategorien hinzufügen, umbenennen, löschen
- [x] Fragen pro Kategorie erstellen:
  - Punktwert wählen (Dropdown)
  - Fragetext eingeben
  - Bild hochladen (Preview anzeigen)
  - Audio hochladen (Player anzeigen)
  - Video hochladen (Player anzeigen)
- [x] Fragen bearbeiten und löschen
- [x] Quiz als JSON exportieren (Download)
- [x] Quiz aus JSON importieren (Upload)
- [x] Weiter zur Lobby (Room erstellen)

### Lobby (`LobbyPage.tsx`)
- [x] Room-Code groß anzeigen (Spieler kopieren diesen)
- [x] Liste verbundener Spieler anzeigen (live, via WebSocket)
- [x] Spielerreihenfolge per Drag & Drop anpassen
- [x] Reihenfolge zufällig würfeln
- [x] Spiel starten Button (erst aktiv wenn min. 1 Spieler verbunden)

### Control Panel (`ControlPage.tsx`)
- [x] **Board-Ansicht:** alle Kategorien und Punktwerte, gespielte Felder ausgegraut
- [x] Frage auswählen → öffnen (an alle senden)
- [x] Aktuelle Frage anzeigen (Vorschau)
- [x] Anzeige: wer ist gerade dran (aktiver Spieler)
- [x] **Antwort bewerten:** Buttons „Richtig ✓" und „Falsch ✗"
- [x] Buzzer-Phase: anzeigen wer gebuzzert hat
- [x] Scores aller Spieler live anzeigen
- [x] Score manuell korrigieren (Eingabefeld pro Spieler)
- [x] Spiel beenden Button → Endscreen

---

## Phase 3 — Player-Frontend (React + TypeScript + Vite)

### Projektstruktur aufsetzen
- [x] Vite-Projekt initialisieren
- [x] Selbe Type-Definitionen wie Admin-Frontend (kopiert)
- [x] Ordnerstruktur:
  ```
  player-frontend/
  ├── src/
  │   ├── pages/
  │   │   ├── JoinPage.tsx        → Room-Code + Name eingeben
  │   │   ├── WaitingPage.tsx     → Lobby-Warteraum
  │   │   ├── GamePage.tsx        → Board + Frage + Buzzer
  │   │   └── EndPage.tsx         → Endscreen
  │   ├── store/
  │   │   └── gameStore.ts
  │   └── ws/
  │       └── socket.ts
  ```

### Join-Flow (`JoinPage.tsx`)
- [x] Room-Code Eingabefeld (6 Zeichen, Auto-Uppercase)
- [x] Name Eingabefeld
- [x] Beitreten Button → WebSocket verbinden → JOIN_GAME senden
- [x] Fehlerbehandlung: ungültiger Code

### Warteraum (`WaitingPage.tsx`)
- [x] Anzeigen: "Warte auf den Moderator..."
- [x] Liste der anderen verbundenen Spieler anzeigen
- [x] Eigenen Namen anzeigen

### Spielansicht (`GamePage.tsx`)
- [x] **Board-Ansicht:** Kategorien + Punktwerte (read-only, gespielte ausgegraut)
- [x] **Fragen-Anzeige** wenn Moderator eine öffnet:
  - Text anzeigen
  - Bild anzeigen (falls vorhanden)
  - Audio-Player (falls vorhanden, Auto-Play)
  - Video-Player (falls vorhanden, Auto-Play)
- [x] Anzeige: "Du bist dran!" wenn aktiver Spieler
- [x] Anzeige: wer gerade antwortet
- [x] **Buzzer-Button:** groß, reaktionsschnell
  - Deaktiviert wenn nicht in Buzzer-Phase
  - Aktiviert wenn BUZZER_OPEN empfangen
  - Deaktiviert nach eigenem Buzz (verhindert Doppel-Buzz)
- [x] Eigener Score immer sichtbar (Header)
- [x] Mini-Leaderboard immer sichtbar (unten)

### Endscreen (`EndPage.tsx`)
- [x] Finale Rangliste mit Platz, Name, Score
- [x] Gewinner hervorheben (🥇🥈🥉)
- [x] "Neues Spiel" → zurück zu JoinPage

---

## Phase 4 — Design & Polish

> Diese Phase kommt nach dem funktionalen Build. Design wird mit separatem Prompt erstellt.

- [ ] Design-System definieren (Farben, Fonts, Spacing)
- [ ] Admin-Frontend stylen
- [ ] Player-Frontend stylen (besonders Buzzer-Button — muss sich gut anfühlen)
- [ ] Animationen: Board-Aufdeckung, Punkte-Counter, Buzzer-Feedback
- [ ] Responsive: Player-Frontend muss auf Handy gut funktionieren (Spieler nutzen Handy)
- [ ] Sound-Effekte (optional): Buzzer-Sound, richtig/falsch Sound

---

## Phase 5 — Deployment-Vorbereitung

- [ ] Environment-Variablen für Backend-URL konfigurieren (`.env`)
- [ ] Docker-Compose für lokales Setup (Backend + statische Frontends)
- [ ] Caddy-Config für Reverse Proxy (Backend API + WebSocket + Frontend)
- [ ] README mit Setup-Anleitung schreiben

---

## Hinweise für Claude Code

- Starte immer mit **Phase 1 (Backend)**, da beide Frontends davon abhängen
- Die WebSocket Message-Types aus der `PROJECT_OVERVIEW.md` sind verbindlich — halte dich daran
- TypeScript-Types in beiden Frontends sollen identisch sein — erwäge ein `shared/types.ts` das von beiden genutzt wird oder kopiert wird
- Der Buzzer muss **so schnell wie möglich** zum Server gesendet werden — kein Debounce, kein Delay
- Medien-URLs die das Backend zurückgibt sind relativ (`/media/filename.jpg`) — Frontend baut die volle URL mit der Backend-Base-URL zusammen
- Für den MVP reicht **ein Room pro Server-Instanz** — kein Multi-Room nötig
- Kein Auth für den Admin im MVP — wer zuerst `/admin` aufruft ist der Moderator
