# BrainStorm – Testplan

**Version:** 2.0  
**Stand:** 2026-05-06  
**Produkt:** BrainStorm Multiplayer-Quiz (Jeopardy)

---

## Automatisierte Tests

Die meisten Backend-Szenarien sind durch Go-Unit-Tests abgedeckt und laufen vollautomatisch:

```bash
make test          # Go-Tests mit Race-Detektor
make test-api      # Postman-Collection via Newman (npm i -g newman nötig)
```

**Was die automatisierten Tests abdecken:**

| Paket | Scope |
|-------|-------|
| `games/api` | Alle REST-Endpunkte inkl. Auth, CORS, Fehlerszenarien, Library, Media |
| `games/game/core` | Room, Player-Management, Scoring, Phasen |
| `games/game/jeopardy` | Spiellogik, Buzzer, Timer, Board-Validierung |
| `games/media` | Upload-Handler (gültige/ungültige Typen, Persistenz) |

**Was manuell getestet werden muss:** Frontend-UX, WebSocket-Verhalten im Browser, QR-Code, Drag & Drop, Sound-Effekte, Multi-Device-Szenarien.

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#1-voraussetzungen)
2. [Smoke Tests – Infrastruktur](#2-smoke-tests--infrastruktur)
3. [Auth-Flow](#3-auth-flow)
4. [REST API – Room-Management](#4-rest-api--room-management)
5. [REST API – Quiz, Library & Media](#5-rest-api--quiz-library--media)
6. [Admin-Frontend – Login & HomePage](#6-admin-frontend--login--homepage)
7. [Admin-Frontend – LobbyPage](#7-admin-frontend--lobbypage)
8. [Admin-Frontend – Quiz-Builder](#8-admin-frontend--quiz-builder)
9. [Admin-Frontend – ControlPage](#9-admin-frontend--controlpage)
10. [Player-Frontend – JoinPage](#10-player-frontend--joinpage)
11. [Player-Frontend – WaitingPage](#11-player-frontend--waitingpage)
12. [Player-Frontend – JeopardyGame](#12-player-frontend--jeopardygame)
13. [Player-Frontend – EndPage](#13-player-frontend--endpage)
14. [Vollständiger Spielablauf (Integration)](#14-vollständiger-spielablauf-integration)
15. [Multi-Board-Flow](#15-multi-board-flow)
16. [Edge Cases & Fehlerszenarien](#16-edge-cases--fehlerszenarien)
17. [Checkliste](#17-checkliste)

---

## 1. Voraussetzungen

### Setup

```bash
docker compose up -d
docker compose ps   # alle Container: running
make test           # Go-Unit-Tests lokal ausführen
```

### URLs (lokal)

| Dienst | URL |
|--------|-----|
| Player-Frontend | `http://192.168.178.130/` |
| Admin-Frontend | `http://192.168.178.130/admin` |
| Backend API | `http://192.168.178.130/api` |
| WebSocket | `ws://192.168.178.130/ws` |

### Benötigte Tools

- Browser (Chrome oder Firefox)
- `curl` im Terminal
- `ADMIN_TOKEN` aus der Root-`.env` bekannt

### Beispiel-Quiz

```bash
cat > /tmp/quiz.json << 'EOF'
[
  {
    "id": "cat-1",
    "name": "Geographie",
    "questions": [
      {"id": "q-1", "points": 100, "text": "Hauptstadt von Deutschland?", "answer": "Berlin", "imageUrl": "", "audioUrl": "", "videoUrl": ""},
      {"id": "q-2", "points": 200, "text": "Längster Fluss der Welt?", "answer": "Nil", "imageUrl": "", "audioUrl": "", "videoUrl": ""}
    ]
  },
  {
    "id": "cat-2",
    "name": "Wissenschaft",
    "questions": [
      {"id": "q-3", "points": 100, "text": "Chemisches Symbol für Wasser?", "answer": "H2O", "imageUrl": "", "audioUrl": "", "videoUrl": ""},
      {"id": "q-4", "points": 200, "text": "Wie viele Planeten hat unser Sonnensystem?", "answer": "8", "imageUrl": "", "audioUrl": "", "videoUrl": ""}
    ]
  }
]
EOF
```

---

## 2. Smoke Tests – Infrastruktur

> **Automatisiert:** `make test` deckt Backend-Seite ab. Nur die Browser-Checks sind manuell.

### 2.1 Backend API erreichbar

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" http://192.168.178.130/api/rooms
```
**Erwartet:** HTTP 200, JSON-Array

### 2.2 Auth-Schutz greift

```bash
curl -s -o /dev/null -w "%{http_code}" http://192.168.178.130/api/rooms
```
**Erwartet:** `401`

### 2.3 Admin-Frontend lädt

Browser → `http://192.168.178.130/admin`  
**Erwartet:** Login-Seite erscheint (kein 404, kein weißer Screen)

### 2.4 Player-Frontend lädt

Browser → `http://192.168.178.130/`  
**Erwartet:** Join-Formular sichtbar

### 2.5 WebSocket erreichbar

```bash
# mit websocat (optional)
websocat ws://192.168.178.130/ws
```
**Erwartet:** Verbindung aufgebaut

---

## 3. Auth-Flow

> **Automatisiert:** Go-Tests in `games/api` prüfen 401/200 für alle geschützten Endpunkte.

### 3.1 Admin-Login im Browser

1. `http://192.168.178.130/admin` → Redirect zur `/login`-Seite
2. `ADMIN_TOKEN` eingeben, bestätigen
3. Token wird in `localStorage` gespeichert

**Erwartet:** Redirect zur Rooms-Übersicht; kein erneutes Login bei Seitenreload

### 3.2 Login persistiert

1. Nach Login Tab neu laden
2. Seite lädt direkt ohne Login-Prompt

**Erwartet:** Kein erneutes Login erforderlich

### 3.3 Falschem Token → Fehlermeldung

1. Auf `/admin/login` navigieren, falsches Token eingeben
2. Bestätigen

**Erwartet:** Fehlermeldung "Ungültig" oder ähnlich; kein Zugang

### 3.4 API ohne Token → 401

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://192.168.178.130/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"game_type":"jeopardy"}'
```
**Erwartet:** `401`

### 3.5 Library Write ohne Token → 401

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://192.168.178.130/api/library \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","game_type":"jeopardy","categories":[]}'
```
**Erwartet:** `401`

### 3.6 Öffentlicher Room-Info-Endpunkt (kein Token)

```bash
export CODE=<room-code>
curl -s http://192.168.178.130/api/room-info/$CODE | jq .
```
**Erwartet:** HTTP 200, `game_type` und `room_phase` — kein Auth-Header nötig

---

## 4. REST API – Room-Management

> **Automatisiert:** Go-Tests in `games/api`.

### 4.1 Room erstellen

```bash
curl -s -X POST http://192.168.178.130/api/rooms \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"game_type": "jeopardy"}' | jq .
export CODE=<code aus Antwort>
```
**Erwartet:** HTTP 201, 6-stelliger Code, `room_phase: "LOBBY"`, `game_type: "jeopardy"`

### 4.2 Alle Rooms abrufen

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://192.168.178.130/api/rooms | jq .
```
**Erwartet:** HTTP 200, Array mit dem erstellten Room

### 4.3 Einzelnen Room abrufen

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://192.168.178.130/api/rooms/$CODE | jq .
```
**Erwartet:** HTTP 200, `room_phase: "LOBBY"`, `players: []`

### 4.4 Room löschen

```bash
TEMP=$(curl -s -X POST http://192.168.178.130/api/rooms \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"game_type":"jeopardy"}' | jq -r .code)

curl -s -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://192.168.178.130/api/rooms/$TEMP

curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://192.168.178.130/api/rooms/$TEMP
```
**Erwartet:** DELETE → 200; GET danach → 404

### 4.5 Spieler-Reihenfolge

```bash
curl -s -X POST http://192.168.178.130/api/rooms/$CODE/players/order \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[]'

curl -s -X POST http://192.168.178.130/api/rooms/$CODE/players/shuffle \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```
**Erwartet:** jeweils HTTP 200

### 4.6 Spieler kicken

```bash
# Zuerst Room-Snapshot holen, Player-ID aus scores[0].id nehmen:
PLAYER_ID=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://192.168.178.130/api/rooms/$CODE | jq -r '.scores[0].id')

curl -s -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://192.168.178.130/api/rooms/$CODE/players/$PLAYER_ID
```
**Erwartet:** HTTP 200; Spieler erscheint nicht mehr in der Lobby

---

## 5. REST API – Quiz, Library & Media

> **Automatisiert:** Go-Tests in `games/api` und `games/media`.

### 5.1 Quiz hochladen

```bash
curl -s -X POST http://192.168.178.130/api/rooms/$CODE/quiz \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/quiz.json | jq .
```
**Erwartet:** HTTP 200, Board mit 2 Kategorien

### 5.2 Quiz exportieren

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://192.168.178.130/api/rooms/$CODE/export | jq .
```
**Erwartet:** HTTP 200, Kategorien + Antworten enthalten

### 5.3 Board-Limits

```bash
# >6 Kategorien → 400:
python3 -c "import json; print(json.dumps([{'id':f'c{i}','name':f'Cat{i}','questions':[]} for i in range(7)]))" \
  | curl -s -X POST http://192.168.178.130/api/rooms/$CODE/quiz \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" -d @-
```
**Erwartet:** HTTP 400, Fehlermeldung "too many categories"

### 5.4 Library – Quiz anlegen

```bash
curl -s -X POST http://192.168.178.130/api/library \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Mein Quiz","game_type":"jeopardy","categories":[]}' | jq .
export QUIZ_ID=<id aus Antwort>
```
**Erwartet:** HTTP 201, `id` vorhanden

### 5.5 Library – Quiz laden

```bash
curl -s http://192.168.178.130/api/library | jq .          # Liste (kein Auth)
curl -s http://192.168.178.130/api/library/$QUIZ_ID | jq . # Detail (kein Auth)
```
**Erwartet:** HTTP 200

### 5.6 Library – Quiz in Room laden

```bash
curl -s -X POST http://192.168.178.130/api/rooms/$CODE/quiz/library/$QUIZ_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
```
**Erwartet:** HTTP 200, Room-Board aus Library-Quiz gesetzt

### 5.7 Library – Quiz löschen

```bash
curl -s -X DELETE http://192.168.178.130/api/library/$QUIZ_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
curl -s http://192.168.178.130/api/library/$QUIZ_ID
```
**Erwartet:** DELETE → 200; GET danach → 404

### 5.8 Media-Upload – Bild

```bash
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > /tmp/test.png

curl -s -X POST http://192.168.178.130/api/media/upload \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@/tmp/test.png" | jq .
```
**Erwartet:** HTTP 200, `url` → `/media/<uuid>.png`

### 5.9 Media-Upload – Ungültiger Typ

```bash
echo "kein bild" > /tmp/test.txt
curl -s -X POST http://192.168.178.130/api/media/upload \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@/tmp/test.txt"
```
**Erwartet:** HTTP 400

### 5.10 Timer-Endpunkt

```bash
# Timer starten (30 Sek.):
curl -s -X POST http://192.168.178.130/api/rooms/$CODE/question/timer \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"seconds":30}' | jq .

# Timer stoppen:
curl -s -X POST http://192.168.178.130/api/rooms/$CODE/question/timer \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"seconds":0}' | jq .
```
**Erwartet:** Start → `endsAt` + `durationMs`; Stop → `status: "stopped"`

---

## 6. Admin-Frontend – Login & HomePage

### 6.1 Login-Seite

1. `http://192.168.178.130/admin` öffnen
2. Redirect zur `/login`-Route
3. Token eingeben, bestätigen

**Erwartet:** Redirect zur Rooms-Übersicht

### 6.2 Rooms-Übersicht

1. Rooms-Liste sichtbar (Polling alle 5s)
2. Room aus 4.1 erscheint mit Phase "LOBBY"

### 6.3 Room erstellen (Browser)

1. "Neuen Room erstellen"-Button → Room erscheint sofort

### 6.4 Room öffnen

| Phase | Erwartetes Ziel |
|-------|----------------|
| LOBBY | LobbyPage |
| IN_PROGRESS | ControlPage |

### 6.5 Room löschen

1. Löschen-Button → Bestätigungsdialog → bestätigen
2. Room verschwindet aus Liste ohne Reload

---

## 7. Admin-Frontend – LobbyPage

### 7.1 QR-Code anzeigen & scannen

1. QR-Code sichtbar, zeigt auf Player-Frontend-URL mit Room-Code
2. Smartphone scannen → Player-Frontend öffnet sich

### 7.2 Room-Code kopieren

"Code kopieren"-Button → Strg+V → 6-stelliger Code

### 7.3 Spieler live sehen

1. Player-Frontend in anderem Tab → Room-Code eingeben → beitreten
2. LobbyPage zeigt Spieler ohne Reload mit "Online"-Badge

### 7.4 Spieler-Reihenfolge

- Drag & Drop → Reihenfolge bleibt nach Loslassen
- Shuffle-Button → Reihenfolge ändert sich zufällig

### 7.5 Spieler kicken (Browser)

1. Kick-Button neben Spieler klicken
2. Spieler verschwindet aus Lobby; auf Player-Seite: Rückkehr zur JoinPage

### 7.6 Spiel starten

**Vorbereitung:** Quiz geladen (siehe 5.1), mind. 1 Spieler in Lobby  
1. "Spiel starten"-Button
2. Admin → ControlPage; Player → GamePage

---

## 8. Admin-Frontend – Quiz-Builder

### 8.1–8.5 Basis-Funktionen

| Test | Aktion | Erwartet |
|------|--------|----------|
| 8.1 | Builder öffnen (`/builder/jeopardy`) | Lädt ohne Fehler |
| 8.2 | Kategorie hinzufügen | Neue Spalte sichtbar |
| 8.3 | Frage hinzufügen (Text, Antwort, Punkte) | Frage erscheint |
| 8.4 | Media hochladen | Bild-URL erscheint im Feld |
| 8.5 | Fragen Drag & Drop | Reihenfolge bleibt |

### 8.6 JSON exportieren

"Export JSON" → `quiz.json` wird heruntergeladen, Inhalt valides JSON

### 8.7 JSON importieren

"Import JSON" → `quiz.json` vom lokalen Rechner → Kategorien erscheinen im Builder

### 8.8 In Library speichern

1. Quiz im Builder aufgebaut
2. "In Library speichern"-Button → Name eingeben → bestätigen
3. Quiz erscheint in der Library-Liste

### 8.9 Quiz zu Room hochladen

1. Room-Code eingeben
2. "Upload to Room" → Erfolgs-Meldung

---

## 9. Admin-Frontend – ControlPage

### 9.1 Board & Fragen

1. Alle Kategorien als Spalten sichtbar
2. Fragen als Buttons mit Punktwerten

### 9.2 Frage öffnen → Overlay

Klick auf Frage → Overlay mit Text, Kategorie, Punkten; Phase → `ACTIVE_PLAYER_ANSWERING`

### 9.3 Antwort aufdecken

"Antwort aufdecken" → korrekte Antwort sichtbar

### 9.4 Richtig bewerten

"✓ Richtig" → Punkte +100; Score-Strip aktuell; Frage als gespielt markiert

### 9.5 Falsch bewerten → Buzzer-Phase

"✗ Falsch" → Phase `BUZZER_PHASE`; Spieler können buzzern

### 9.6 Buzzer-Antwort bewerten

| Bewertung | Erwartetes Delta |
|-----------|-----------------|
| Buzzer richtig | +50 (halbe Punkte) |
| Buzzer falsch | -50, nächster Spieler kann buzzern |

### 9.7 Score manuell editieren

Klick auf Score → Eingabefeld → neuen Wert → bestätigen

### 9.8 Timer starten/stoppen

1. Timer-Button → Countdown läuft bei allen Clients synchron
2. Stopp-Button → Timer verschwindet bei allen Clients

### 9.9 Spiel beenden

"Spiel beenden" → `GAME_OVER`; Player → EndPage mit Rangliste

---

## 10. Player-Frontend – JoinPage

### 10.1–10.8 Validierung & UX

| Test | Eingabe | Erwartet |
|------|---------|----------|
| 10.1 | Seite laden | Join-Formular sichtbar |
| 10.2 | Leerer Code | Button deaktiviert |
| 10.3 | Kleinbuchstaben | Auto-Großschreibung |
| 10.4 | Leerer Name | Fehlermeldung beim Absenden |
| 10.5 | Falscher Code | Fehlermeldung, bleibt auf JoinPage |
| 10.6 | Gültiger Join | Navigation zu `/waiting` |
| 10.7 | Enter-Taste | Formular abgeschickt |
| 10.8 | Code-Dots | Füllen sich mit jedem Zeichen |

---

## 11. Player-Frontend – WaitingPage

### 11.1 Warteansicht

"Warte auf Spiel"-Anzeige; kein Fehler

### 11.2 Auto-Navigation zum Spiel

Admin startet Spiel → Player wechselt automatisch zu `/game`

### 11.3 Auto-Navigation zur JoinPage

Admin löscht Room → Player kehrt automatisch zu `/` zurück

---

## 12. Player-Frontend – JeopardyGame

### 12.1 Board

Kategorien und Punktwerte sichtbar

### 12.2 Frage-Overlay

Admin öffnet Frage → Overlay erscheint automatisch beim Player

### 12.3 Status-Bar

Zeigt aktuelle Phase und aktiven Spieler

### 12.4–12.7 Buzzer-Zustände

| Zustand | Aussehen |
|---------|---------|
| Nicht an der Reihe | Grau/inaktiv |
| Buzzer offen | Gold/aktiv |
| Selbst gebuzzert | Hervorgehoben |
| Anderer gebuzzert | Deaktiviert |

Buzzern per Klick und per Leertaste

### 12.8 Antwort-Feedback

Richtig → grünes ✓; Falsch → rotes ✗ (kurz, dann weg)

### 12.9 Score-Delta-Animation

Animierter Delta-Wert (+100 / -50) erscheint kurz im Score-Strip

### 12.10 Sound-Effekte

Buzzer öffnet → Buzzer-Sound; Richtig → Correct-Sound; Falsch → Wrong-Sound

---

## 13. Player-Frontend – EndPage

| Test | Erwartet |
|------|---------|
| 13.1 | Rangliste in korrekter Reihenfolge |
| 13.2 | Medaillen 🥇🥈🥉 korrekt |
| 13.3 | Eigene Position hervorgehoben |
| 13.4 | "Neues Spiel" → JoinPage |

---

## 14. Vollständiger Spielablauf (Integration)

**Setup:** 1× Admin-Browser, 2× Player (Inkognito-Tab oder Smartphone)

### Phase 1 – Vorbereitung

```bash
# Terminal-Alternative für Quiz-Upload:
curl -s -X POST http://192.168.178.130/api/rooms/$CODE/quiz \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d @/tmp/quiz.json
```

1. Admin: Room erstellen → zur LobbyPage
2. Admin: Quiz laden
3. Player 1 (Alice) und Player 2 (Bob) beitreten
4. **Checkpoint:** Beide Spieler in der Lobby ✓

### Phase 2 – Spielstart

5. Admin: "Spiel starten"
6. **Checkpoint:** Admin auf ControlPage, Player auf GamePage ✓

### Phase 3 – Aktiver Spieler richtig

7. Admin: "Geographie 100" öffnen → Antwort aufdecken → "✓ Richtig"
8. **Checkpoint:** Alice +100 Punkte ✓

### Phase 4 – Buzzer-Flow

9. Admin: Nächste Frage (Bob aktiv) → "✗ Falsch" → Buzzer-Phase
10. Alice buzzert → Admin: "✓ Richtig"
11. **Checkpoint:** Alice 150, Bob -50 ✓

### Phase 5 – Spielende

12. Admin: "Spiel beenden"
13. **Checkpoint:** Alle Clients → Rangliste, korrekte Reihenfolge ✓

---

## 15. Multi-Board-Flow

**Vorbereitung:** Laufendes Spiel, mindestens ein Board komplett gespielt.

### 15.1 Board abgeschlossen

Alle Fragen eines Boards gespielt → Phase wechselt zu `BOARD_COMPLETE`  
**Erwartet:** Player sehen Wartescreen, Admin sieht Board-Auswahl

### 15.2 Nächstes Board laden

1. Admin: "Nächstes Board laden" → Board aus Library auswählen
2. Neues Board erscheint im ControlPage
3. Player sehen neues Board

**Erwartet:** Scores bleiben erhalten, Board wird ersetzt

### 15.3 Spiel beenden nach mehreren Boards

Admin: "Spiel beenden" → Finale Rangliste mit akkumulierten Scores

---

## 16. Edge Cases & Fehlerszenarien

### 16.1 Player Disconnect & Reconnect

1. Player-Tab schließen → "Offline"-Badge in Lobby/ControlPage
2. Gleichen Tab öffnen, gleichen Code + Namen → Reconnect mit gleicher ID
3. **Erwartet:** Score erhalten, wieder "Online"

### 16.2 Simultaner Buzzer

Beide Spieler drücken gleichzeitig den Buzzer  
**Erwartet:** Nur erster wird angenommen

### 16.3 Buzzer außerhalb der Phase

Phase ≠ `BUZZER_PHASE` → Buzzer-Klick ignoriert

### 16.4 Score auf negativen Wert setzen

Admin setzt Score manuell auf `-999` → korrekt angezeigt

### 16.5 Spieltyp-Wechsel nur in LOBBY

Laufendes Spiel → Spieltyp-Wechsel nicht möglich

### 16.6 Quiz neu laden überschreibt altes

Anderes Quiz hochladen → altes Board ersetzt, nur neues Quiz aktiv

### 16.7 Admin-State nach Reload

Admin auf ControlPage → Browser-Tab neu laden → Spielzustand (Board, Scores, Phase) wiederhergestellt

### 16.8 Room Auto-Cleanup

> Nur bei Bedarf: 30 Minuten warten, leere LOBBY-Rooms verschwinden automatisch.

---

## 17. Checkliste

### Automatisiert (Go-Tests – `make test`)

- [x] Alle REST-Endpunkte für Room-Management
- [x] Quiz hochladen, exportieren, Board-Limits
- [x] Spielstart, Spielende, Fragen-Flow
- [x] Antwort-Scoring (richtig/falsch/Buzzer)
- [x] Spieler-Management (Order, Shuffle, Kick, Score)
- [x] Timer starten / stoppen
- [x] Öffentlicher Room-Info-Endpunkt (kein Auth)
- [x] Auth-Middleware (401 ohne Token, 200 mit Token)
- [x] CORS-Header und Preflight
- [x] Library CRUD (GET Liste, GET Detail, POST, PUT, DELETE)
- [x] Library Auth-Schutz für Write-Ops
- [x] Media-Upload (PNG gültig, Text ungültig, Persistenz)

### Smoke Tests (manuell)

- [ ] **ST-1** Backend `/api/rooms` mit Token → 200
- [ ] **ST-2** Backend `/api/rooms` ohne Token → 401
- [ ] **ST-3** Admin-Frontend lädt, zeigt Login-Seite
- [ ] **ST-4** Player-Frontend lädt, zeigt Join-Formular
- [ ] **ST-5** WebSocket-Verbindung aufbaubar

### Auth-Flow (manuell)

- [ ] **AF-1** Login mit korrektem Token → Zugang
- [ ] **AF-2** Login mit falschem Token → Fehlermeldung
- [ ] **AF-3** Token persistiert nach Reload
- [ ] **AF-4** `/api/room-info/:code` ohne Token → 200

### REST API (manuell / curl)

- [ ] **RM-1** POST /api/rooms → 201, 6-stelliger Code
- [ ] **RM-2** GET /api/rooms → Room in Liste
- [ ] **RM-3** DELETE /api/rooms/:code → 200; GET danach → 404
- [ ] **RM-4** DELETE /api/rooms/:code/players/:id → Spieler entfernt
- [ ] **QM-1** POST /quiz → Board korrekt
- [ ] **QM-2** POST /quiz mit >6 Kategorien → 400
- [ ] **QM-3** GET /export → Quiz vollständig
- [ ] **QM-4** POST /media/upload (PNG) → URL zurück
- [ ] **QM-5** POST /media/upload (TXT) → 400
- [ ] **TM-1** POST /question/timer (seconds>0) → endsAt, durationMs
- [ ] **TM-2** POST /question/timer (seconds=0) → stopped
- [ ] **LB-1** GET /api/library → Liste (kein Auth)
- [ ] **LB-2** POST /api/library → Quiz erstellt
- [ ] **LB-3** DELETE /api/library/:id → Quiz gelöscht

### Admin-Frontend (manuell)

- [ ] **AH-1** Rooms-Liste, neu erstellen, öffnen, löschen
- [ ] **AL-1** QR-Code, Spieler live, Drag & Drop, Shuffle, Kick, Spiel starten
- [ ] **QB-1** Builder: Kategorie, Frage, Media, Export, Import, Library speichern, Upload to Room
- [ ] **AC-1** Board, Frage öffnen, Antwort aufdecken, Richtig/Falsch, Buzzer, Timer, Score, Spiel beenden

### Player-Frontend (manuell)

- [ ] **PJ-1** Join-Validierung (leerer Code, Kleinbuchstaben, falscher Code, Dots)
- [ ] **PW-1** Warteseite, Auto-Navigation bei Start und Room-Löschen
- [ ] **PG-1** Board, Frage-Overlay, Status-Bar, Buzzer, Feedback, Delta-Animation, Sound
- [ ] **PE-1** Rangliste, Medaillen, eigene Position, Neues Spiel

### Integration (manuell)

- [ ] **IN-1** Vollständiger Spielablauf: Vorbereitung → Spielstart → Scoring → Spielende
- [ ] **IN-2** Multi-Board: Board komplett → nächstes laden → Scores akkumulieren
- [ ] **EC-1** Disconnect/Reconnect (Score erhalten)
- [ ] **EC-2** Simultaner Buzzer (nur erster gewinnt)
- [ ] **EC-3** Admin-State nach Reload
