# BrainStorm – Manueller Testplan

**Version:** 1.0  
**Stand:** 2026-04-27  
**Produkt:** BrainStorm Multiplayer-Quiz (Jeopardy)

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#1-voraussetzungen)
2. [Smoke Tests – Infrastruktur](#2-smoke-tests--infrastruktur)
3. [REST API – Room-Management](#3-rest-api--room-management)
4. [REST API – Quiz & Media](#4-rest-api--quiz--media)
5. [Admin-Frontend – HomePage](#5-admin-frontend--homepage)
6. [Admin-Frontend – LobbyPage](#6-admin-frontend--lobbypage)
7. [Admin-Frontend – Quiz-Builder](#7-admin-frontend--quiz-builder)
8. [Admin-Frontend – ControlPage](#8-admin-frontend--controlpage)
9. [Player-Frontend – JoinPage](#9-player-frontend--joinpage)
10. [Player-Frontend – WaitingPage](#10-player-frontend--waitingpage)
11. [Player-Frontend – JeopardyGame](#11-player-frontend--jeopardygame)
12. [Player-Frontend – EndPage](#12-player-frontend--endpage)
13. [Vollständiger Spielablauf (Integration)](#13-vollständiger-spielablauf-integration)
14. [Edge Cases & Fehlerszenarien](#14-edge-cases--fehlerszenarien)
15. [Checkliste](#15-checkliste)

---

## 1. Voraussetzungen

### Setup

```bash
# Docker Stack starten (im Projekt-Root)
docker compose up -d

# Status prüfen
docker compose ps
```

Alle drei Container müssen `running` sein: `backend`, `caddy`.

### URLs (lokal)

| Dienst | URL |
|--------|-----|
| Player-Frontend | `http://192.168.178.130/` |
| Admin-Frontend | `http://192.168.178.130/admin` |
| Backend API | `http://192.168.178.130/api` |
| WebSocket | `ws://192.168.178.130/ws` |

> **Tipp:** Für Player-Tests auf dem gleichen Rechner: zweites Browserfenster oder Inkognito-Tab nutzen. Für QR-Code-Tests: Smartphone im selben WLAN.

### Benötigte Tools

- Browser (Chrome oder Firefox, aktuell)
- `curl` im Terminal
- Optional: Smartphone für QR-Code-Scan
- Optional: [websocat](https://github.com/vi/websocat) für WebSocket-Tests


### Beispiel-Quiz (JSON)

Dieses Quiz wird in mehreren Tests benötigt – einmal als Datei für `curl`-Befehle und einmal zum Importieren im Browser. Erstelle die Datei **einmalig zu Beginn** mit diesem Befehl im Terminal:

```bash
cat > /tmp/quiz.json << 'EOF'
[
  {
    "id": "cat-1",
    "name": "Geographie",
    "questions": [
      {
        "id": "q-1",
        "points": 100,
        "text": "Hauptstadt von Deutschland?",
        "answer": "Berlin",
        "imageUrl": "",
        "audioUrl": "",
        "videoUrl": ""
      },
      {
        "id": "q-2",
        "points": 200,
        "text": "Längster Fluss der Welt?",
        "answer": "Nil",
        "imageUrl": "",
        "audioUrl": "",
        "videoUrl": ""
      }
    ]
  },
  {
    "id": "cat-2",
    "name": "Wissenschaft",
    "questions": [
      {
        "id": "q-3",
        "points": 100,
        "text": "Chemisches Symbol für Wasser?",
        "answer": "H2O",
        "imageUrl": "",
        "audioUrl": "",
        "videoUrl": ""
      },
      {
        "id": "q-4",
        "points": 200,
        "text": "Wie viele Planeten hat unser Sonnensystem?",
        "answer": "8",
        "imageUrl": "",
        "audioUrl": "",
        "videoUrl": ""
      }
    ]
  }
]
EOF
```

Prüfen ob die Datei korrekt erstellt wurde:

```bash
cat /tmp/quiz.json | jq .[].name
# Ausgabe: "Geographie" und "Wissenschaft"
```

> Diese Datei wird in Tests 4.1 (curl-Upload), 7.7 (Browser-Import) und 13 (Integration) verwendet. Downloade sie auch auf deinen lokalen Rechner, falls du sie im Browser-Datei-Dialog auswählen musst (der Browser sieht `/tmp/` auf dem Server nicht direkt).

---

## 2. Smoke Tests – Infrastruktur

**Ziel:** Prüfen ob alle Dienste erreichbar sind.

### 2.1 Backend API erreichbar

```bash
curl -s http://192.168.178.130/api/rooms
```

**Erwartetes Ergebnis:** HTTP 200, JSON-Array (leer `[]` oder mit Rooms)

### 2.2 Admin-Frontend lädt

1. Browser öffnen → `http://192.168.178.130/admin`
2. Seite lädt ohne Fehler
3. Titel "BrainStorm" oder Rooms-Übersicht sichtbar

**Erwartetes Ergebnis:** Keine 404, kein weißer Bildschirm, kein Console-Error

### 2.3 Player-Frontend lädt

1. Browser → `http://192.168.178.130/`
2. Join-Formular (Room-Code + Name) sichtbar

**Erwartetes Ergebnis:** Eingabefelder für Code und Name vorhanden

### 2.4 WebSocket-Verbindung

```bash
# Mit websocat (falls installiert)
websocat ws://192.168.178.130/ws
```

**Erwartetes Ergebnis:** Verbindung aufgebaut, keine Fehlermeldung

---

## 3. REST API – Room-Management

**Ziel:** Alle CRUD-Operationen für Rooms testen.

### 3.1 Room erstellen

```bash
curl -s -X POST http://192.168.178.130/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"game_type": "jeopardy"}' | jq .
```

**Erwartetes Ergebnis:**
- HTTP 201
- Response enthält `code` (6-stellig, Großbuchstaben/Zahlen)
- `room_phase: "LOBBY"`
- `game_type: "jeopardy"`

> **Merke dir den Code** für die folgenden Tests — z.B. `EXPORT CODE=ABCXYZ`

```bash
export CODE=<deinen-code-hier>
```

### 3.2 Alle Rooms abrufen

```bash
curl -s http://192.168.178.130/api/rooms | jq .
```

**Erwartetes Ergebnis:**
- HTTP 200
- Array enthält den gerade erstellten Room mit dem richtigen Code

### 3.3 Einzelnen Room abrufen

```bash
curl -s http://192.168.178.130/api/rooms/$CODE | jq .
```

**Erwartetes Ergebnis:**
- HTTP 200
- Room-Details: `code`, `room_phase: "LOBBY"`, `players: []`

### 3.4 Room löschen

```bash
# Neuen Room zum Löschen erstellen
TEMP=$(curl -s -X POST http://192.168.178.130/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"game_type": "jeopardy"}' | jq -r .code)

# Löschen
curl -s -X DELETE http://192.168.178.130/api/rooms/$TEMP

# Prüfen ob weg
curl -s http://192.168.178.130/api/rooms/$TEMP
```

**Erwartetes Ergebnis:**
- DELETE: HTTP 200 oder 204
- GET danach: HTTP 404

### 3.5 Spieler-Reihenfolge setzen (API)

```bash
# Setzt Player-Order – Body ist ein JSON-Array mit Spieler-IDs (leer = keine Änderung)
curl -s -X POST http://192.168.178.130/api/rooms/$CODE/players/order \
  -H "Content-Type: application/json" \
  -d '[]'
```

**Erwartetes Ergebnis:** HTTP 200

### 3.6 Spieler-Reihenfolge shufflen (API)

```bash
curl -s -X POST http://192.168.178.130/api/rooms/$CODE/players/shuffle
```

**Erwartetes Ergebnis:** HTTP 200

---

## 4. REST API – Quiz & Media

**Ziel:** Quiz hochladen, exportieren und Media-Upload testen.

### 4.1 Quiz hochladen

**Vorbereitung:** `$CODE` muss gesetzt sein (aus Test 3.1). `/tmp/quiz.json` muss existieren (aus Sektion 1).

```bash
# Sicherstellen dass CODE gesetzt ist
echo "Lade Quiz in Room: $CODE"

curl -s -X POST http://192.168.178.130/api/rooms/$CODE/quiz \
  -H "Content-Type: application/json" \
  -d @/tmp/quiz.json | jq .
```

Der `@`-Prefix bei `-d @/tmp/quiz.json` bedeutet: Dateiinhalt als Request-Body senden (nicht den String `@/tmp/quiz.json`).

**Erwartetes Ergebnis:** HTTP 200, Response enthält das Board mit 2 Kategorien und je 2 Fragen:

```json
{
  "categories": [
    { "name": "Geographie", "questions": [...] },
    { "name": "Wissenschaft", "questions": [...] }
  ]
}
```

### 4.2 Quiz exportieren

```bash
curl -s http://192.168.178.130/api/rooms/$CODE/export | jq .
```

**Erwartetes Ergebnis:**
- HTTP 200
- JSON mit denselben Kategorien und Fragen wie hochgeladen
- `answer`-Felder enthalten die korrekten Antworten

### 4.3 Media-Upload – Bild

```bash
# Testbild erstellen (1x1 pixel PNG)
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > /tmp/test.png

curl -s -X POST http://192.168.178.130/api/media/upload \
  -F "file=@/tmp/test.png" | jq .
```

**Erwartetes Ergebnis:**
- HTTP 200
- Response enthält `url` → `/media/<uuid>.png`

### 4.4 Media-Datei abrufen

```bash
# URL aus vorherigem Test verwenden
MEDIA_URL=$(curl -s -X POST http://192.168.178.130/api/media/upload \
  -F "file=@/tmp/test.png" | jq -r .url)

curl -I http://192.168.178.130$MEDIA_URL
```

**Erwartetes Ergebnis:** HTTP 200, `Content-Type: image/png`

### 4.5 Media-Upload – Ungültiger Typ (Fehlerfall)

```bash
echo "das ist kein bild" > /tmp/test.txt
curl -s -X POST http://192.168.178.130/api/media/upload \
  -F "file=@/tmp/test.txt"
```

**Erwartetes Ergebnis:** HTTP 400 oder 415, Fehlermeldung

---

## 5. Admin-Frontend – HomePage

**Ziel:** Room-Verwaltung im Browser testen.

### 5.1 Rooms-Übersicht

1. `http://192.168.178.130/admin` öffnen
2. Liste der aktiven Rooms ist sichtbar
3. Rooms werden alle 5 Sekunden aktualisiert (Polling läuft im Hintergrund)

**Erwartetes Ergebnis:** Room aus Test 3.1 erscheint in der Liste mit Phase "LOBBY"

### 5.2 Neuen Room erstellen

1. "Neuen Room erstellen"-Button klicken
2. Room erscheint sofort in der Liste
3. 6-stelliger Code ist sichtbar

**Erwartetes Ergebnis:** Neuer Eintrag mit zufälligem Code

### 5.3 Room öffnen (LOBBY)

1. Auf einen LOBBY-Room klicken
2. Navigation zur LobbyPage (`/rooms/:code/lobby`)

**Erwartetes Ergebnis:** LobbyPage wird geladen

### 5.4 Room öffnen (IN_PROGRESS)

1. Einen laufenden Room (Phase `IN_PROGRESS`) anklicken
2. Navigation direkt zur ControlPage (`/rooms/:code/control`)

**Erwartetes Ergebnis:** ControlPage wird geladen (erst nach vollständigem Spielstart testbar)

### 5.5 Room löschen

1. Auf Löschen-Button/Icon beim Room klicken
2. Bestätigungsdialog erscheint
3. Bestätigen
4. Room verschwindet aus der Liste

**Erwartetes Ergebnis:** Room ist weg, kein Reload nötig

---

## 6. Admin-Frontend – LobbyPage

**Ziel:** Alle Lobby-Funktionen testen.

**Vorbereitung:** Einen Room erstellen und zur LobbyPage navigieren.

### 6.1 QR-Code anzeigen

1. LobbyPage öffnen
2. QR-Code ist sichtbar

**Erwartetes Ergebnis:** QR-Code wird gerendert und zeigt auf Player-Frontend-URL mit Room-Code

### 6.2 QR-Code scannen

1. Smartphone (im gleichen WLAN)
2. QR-Code scannen
3. Player-Frontend öffnet sich im Browser des Smartphones

**Erwartetes Ergebnis:** `http://192.168.178.130/` öffnet sich mit vorausgefülltem Code

### 6.3 Room-Code kopieren

1. "Code kopieren"-Button klicken
2. Code in ein Textfeld einfügen (Strg+V)

**Erwartetes Ergebnis:** 6-stelliger Room-Code in der Zwischenablage

### 6.4 Spiel-Typ wechsel

1. Dropdown für Spieltyp ist sichtbar (Standard: "jeopardy")
2. Anderen Typ auswählen (falls verfügbar) und bestätigen
3. GAME_SWITCHED-Message sollte in den WebSocket-Clients ankommen

**Erwartetes Ergebnis:** Typ wechselt, Bestätigung sichtbar

### 6.5 Spieler beitreten sehen

1. Player-Frontend in einem anderen Tab öffnen
2. Room-Code eingeben und beitreten
3. In der LobbyPage erscheint der Spieler live (ohne Reload)

**Erwartetes Ergebnis:** Name des Spielers in der Spielerliste mit grünem "Online"-Badge

### 6.6 Spieler-Reihenfolge per Drag & Drop

1. Mindestens 2 Spieler sind in der Lobby
2. Spieler-Karten per Drag & Drop neu anordnen
3. Reihenfolge wird gespeichert

**Erwartetes Ergebnis:** Neue Reihenfolge bleibt nach Loslassen erhalten

### 6.7 Spieler shufflen

1. "Shuffle"-Button klicken
2. Spieler-Reihenfolge ändert sich zufällig

**Erwartetes Ergebnis:** Reihenfolge ist anders als zuvor

### 6.8 Spiel starten

**Vorbereitung:**
- Ein Quiz muss in den Room geladen sein. Entweder:
  - **Per curl** (Terminal): Test 4.1 durchführen → `curl -X POST .../quiz -d @/tmp/quiz.json`
  - **Per Builder** (Browser): Quiz im Builder bauen und über "Upload to Room" hochladen (Test 7.8)
- Mindestens 1 Spieler muss in der Lobby sein (Test 6.5)

> Ohne Quiz lässt sich das Spiel **nicht starten** – der Button bleibt deaktiviert oder zeigt einen Fehler.

1. "Spiel starten"-Button klicken
2. Admin wird zur ControlPage navigiert
3. Player wechseln automatisch von WaitingPage zu GamePage

**Erwartetes Ergebnis:** Alle Clients sind in der Game-Phase, Board ist sichtbar

---

## 7. Admin-Frontend – Quiz-Builder

**Ziel:** Quiz-Erstellung und Import/Export testen.

### 7.1 Quiz-Builder öffnen

1. Navigation zu `/builder/jeopardy` (Link im Admin-Frontend)
2. Leeres Quiz-Board erscheint

**Erwartetes Ergebnis:** Builder-Seite lädt ohne Fehler

### 7.2 Kategorie hinzufügen

1. "Kategorie hinzufügen"-Button klicken
2. Kategoriename eingeben: "Testgeografie"
3. Kategorie erscheint im Builder

**Erwartetes Ergebnis:** Neue Kategorie-Spalte sichtbar

### 7.3 Frage hinzufügen

1. In der neuen Kategorie eine Frage hinzufügen
2. Frage-Text: "Hauptstadt von Frankreich?"
3. Antwort: "Paris"
4. Punkte: 100

**Erwartetes Ergebnis:** Frage erscheint in der Kategorie

### 7.4 Media hochladen (im Builder)

1. Bei einer Frage den Upload-Button für Bild klicken
2. `test.png` auswählen
3. URL wird gesetzt

**Erwartetes Ergebnis:** Bild-URL erscheint im Feld der Frage

### 7.5 Fragen-Reihenfolge per Drag & Drop

1. Mehrere Fragen in einer Kategorie erstellen
2. Fragen per Drag & Drop neu anordnen

**Erwartetes Ergebnis:** Neue Reihenfolge bleibt erhalten

### 7.6 Quiz als JSON exportieren

1. "Export JSON"-Button klicken
2. Datei wird heruntergeladen

**Erwartetes Ergebnis:** `quiz.json` wird heruntergeladen, Inhalt ist valides JSON

### 7.7 Quiz aus JSON importieren

> **Hinweis:** Der Browser-Datei-Dialog zeigt Dateien auf deinem **lokalen Rechner**, nicht auf dem Server. `/tmp/quiz.json` liegt auf dem Server (`192.168.178.130`). Du hast zwei Möglichkeiten:
> - **Option A:** Datei vorher auf deinen lokalen Rechner herunterladen (z.B. per `scp devboy@192.168.178.130:/tmp/quiz.json ~/Downloads/`)
> - **Option B:** Den Dateiinhalt aus Sektion 1 kopieren, lokal als `quiz.json` speichern, dann auswählen

1. "Import JSON"-Button im Quiz-Builder klicken
2. Datei-Dialog öffnet sich → `quiz.json` vom lokalen Rechner auswählen
3. Quiz wird geladen (kein Reload nötig, passiert sofort im Browser)

**Erwartetes Ergebnis:** Kategorien "Geographie" und "Wissenschaft" mit je 2 Fragen erscheinen im Builder

### 7.8 Quiz zu Room hochladen

**Vorbereitung:** Ein Room muss existieren und sein Code bekannt sein (aus Test 5.2 oder 3.1).

1. Im Quiz-Builder oben ein Feld für den Room-Code suchen (z.B. "Upload to Room" oder ähnliche Bezeichnung)
2. Den 6-stelligen Room-Code eingeben (z.B. `ABCXYZ`)
3. "Upload to Room"-Button klicken

**Erwartetes Ergebnis:** Erfolgs-Meldung erscheint. Zur Kontrolle: `curl -s http://192.168.178.130/api/rooms/$CODE/export | jq .` sollte jetzt das Quiz zurückgeben.

---

## 8. Admin-Frontend – ControlPage

**Ziel:** Spielsteuerung vollständig testen.

**Vorbereitung:** Spiel wurde gestartet (Test 6.8). Mindestens 2 Spieler im Spiel.

### 8.1 Board anzeigen

1. ControlPage öffnen
2. Alle Kategorien sind als Spalten sichtbar
3. Fragen als Buttons mit Punktwerten

**Erwartetes Ergebnis:** Board zeigt `2 Kategorien × 2 Fragen` (aus Beispiel-Quiz)

### 8.2 Frage öffnen

1. Auf eine Frage im Board klicken (z.B. "Geographie 100")
2. Frage-Overlay erscheint
3. Frage-Text ist sichtbar
4. Phase wechselt zu `ACTIVE_PLAYER_ANSWERING`

**Erwartetes Ergebnis:** Frage-Overlay mit Text, Kategorie, Punkten

### 8.3 Antwort aufdecken

1. Im Frage-Overlay "Antwort aufdecken"-Button klicken
2. Antwort erscheint im Overlay

**Erwartetes Ergebnis:** Korrekte Antwort ist jetzt sichtbar

### 8.4 Antwort als "Richtig" bewerten

1. "✓ Richtig"-Button klicken
2. Aktiver Spieler bekommt volle Punkte (`+100`)
3. Score-Strip aktualisiert sich
4. Frage-Overlay schließt sich (oder "Frage schließen" erscheint)

**Erwartetes Ergebnis:** Spieler-Score erhöht sich, Frage im Board als gespielt markiert

### 8.5 Antwort als "Falsch" bewerten (Buzzer-Phase)

1. Neue Frage öffnen
2. "✗ Falsch"-Button klicken
3. Phase wechselt zu `BUZZER_PHASE`
4. Spieler können buzzern

**Erwartetes Ergebnis:** Buzzer-Phase-Indikator erscheint, andere Spieler können buzzern

### 8.6 Buzzer-Antwort bewerten

1. In Buzzer-Phase: Spieler buzzert (Player-Frontend)
2. Admin sieht "Spieler X hat gebuzzert"
3. Antwort bewerten (richtig oder falsch)

**Erwartetes Ergebnis:** Scoring-Logik:
- Buzzer richtig → `+50` (halbe Punkte bei 100er Frage)
- Buzzer falsch → `-50`, nächster Spieler kann buzzern

### 8.7 Score manuell editieren

1. Auf den Score eines Spielers klicken
2. Eingabefeld erscheint
3. Neuen Wert eingeben und bestätigen

**Erwartetes Ergebnis:** Score ändert sich auf den eingegebenen Wert

### 8.8 Spiel beenden

1. "Spiel beenden"-Button klicken
2. GAME_OVER-Phase wird ausgelöst
3. Admin sieht finale Rangliste
4. Player werden zur EndPage navigiert

**Erwartetes Ergebnis:** Alle Clients zeigen finale Scores

---

## 9. Player-Frontend – JoinPage

**Ziel:** Eingabe-Validierung und Verbindung testen.

### 9.1 Seite lädt

1. `http://192.168.178.130/` öffnen
2. Eingabefelder für Code und Name sind sichtbar

**Erwartetes Ergebnis:** Saubere JoinPage ohne Fehler

### 9.2 Code-Eingabe Validierung

| Eingabe | Erwartetes Verhalten |
|---------|---------------------|
| Leer | Join-Button deaktiviert oder Fehlermeldung |
| Weniger als 6 Zeichen | Join-Button deaktiviert |
| 6 Zeichen | Button wird aktiv |
| Kleinbuchstaben | Automatisch in Großbuchstaben konvertiert |

### 9.3 Name-Eingabe Validierung

| Eingabe | Erwartetes Verhalten |
|---------|---------------------|
| Leer | Fehlermeldung beim Abschicken |
| 1 Zeichen | OK |
| 20 Zeichen | OK (Maximum) |
| 21+ Zeichen | Eingabe wird auf 20 beschränkt |

### 9.4 Erfolgreicher Join

1. Gültigen Room-Code eingeben (aus Test 3.1)
2. Name eingeben
3. Enter drücken oder Button klicken

**Erwartetes Ergebnis:** Navigation zu `/waiting`, Admin-LobbyPage zeigt den neuen Spieler

### 9.5 Join mit falschem Code

1. Nicht-existierenden Code eingeben (z.B. `XXXXXX`)
2. Absenden

**Erwartetes Ergebnis:** Fehlermeldung "Room nicht gefunden" oder ähnlich, bleibt auf JoinPage

### 9.6 Code-Dots Animation

1. Buchstaben eintippen
2. 6 Punkte unter dem Eingabefeld zeigen den Eingabe-Fortschritt (grau → farbig)

**Erwartetes Ergebnis:** Dots füllen sich mit jedem Zeichen

---

## 10. Player-Frontend – WaitingPage

**Ziel:** Warte-Zustand und automatische Navigation testen.

**Vorbereitung:** Spieler ist der Lobby beigetreten, Spiel noch nicht gestartet.

### 10.1 Warte-Anzeige

1. Nach dem Join zur WaitingPage navigieren
2. "Warte auf Spiel…"-Meldung ist sichtbar

**Erwartetes Ergebnis:** Ladeanimation oder Warteanzeige, kein Fehler

### 10.2 Automatische Navigation zum Spiel

1. Admin startet das Spiel (Test 6.8)
2. WaitingPage navigiert automatisch zu `/game`

**Erwartetes Ergebnis:** Player landet auf der GamePage ohne manuelles Reload

### 10.3 Automatische Navigation zurück zur JoinPage

1. Spieler ist in der WaitingPage
2. Admin löscht den Room (oder setzt zurück)
3. Player wird zu `/` navigiert

**Erwartetes Ergebnis:** Player-Frontend zeigt wieder die JoinPage

---

## 11. Player-Frontend – JeopardyGame

**Ziel:** Spieler-Interface vollständig testen.

**Vorbereitung:** Spiel ist gestartet, Spieler ist auf der GamePage.

### 11.1 Board anzeigen

1. GamePage öffnen
2. Kategorien und Fragen sind sichtbar

**Erwartetes Ergebnis:** Board mit Kategorien und Punktwerten

### 11.2 Frage-Overlay bei QUESTION_OPENED

1. Admin öffnet eine Frage
2. Player sieht automatisch das Frage-Overlay mit Text und Kategorie

**Erwartetes Ergebnis:** Frage erscheint ohne Interaktion des Spielers

### 11.3 Status-Bar

1. Status-Bar oben zeigt:
   - Aktuelle Phase (z.B. "ACTIVE_PLAYER_ANSWERING")
   - Name des aktiven Spielers

**Erwartetes Ergebnis:** Status ist korrekt und aktuell

### 11.4 Buzzer-Button – Zustände

| Zustand | Beschreibung | Erwartetes Aussehen |
|---------|-------------|---------------------|
| Nicht an der Reihe | Normaler Spieler wartet | Grau/inaktiv |
| Buzzer offen | Phase = BUZZER_PHASE, noch nicht gebuzzert | Gold/aktiv |
| Selbst gebuzzert | Spieler hat bereits gebuzzert | Gold/hervorgehoben |
| Anderer gebuzzert | Anderer Spieler war schneller | Deaktiviert |

### 11.5 Buzzern mit Klick

1. Phase = `BUZZER_PHASE` und Spieler noch nicht gebuzzert
2. Buzzer-Button klicken
3. Admin sieht "Spieler X hat gebuzzert"

**Erwartetes Ergebnis:** PLAYER_BUZZED wird gesendet, Admin-Ansicht aktualisiert

### 11.6 Buzzern mit Leertaste

1. Phase = `BUZZER_PHASE`, Buzzer aktiv
2. Leertaste drücken

**Erwartetes Ergebnis:** Gleiches Ergebnis wie Klick

### 11.7 Antwort-Feedback

1. Admin bewertet Antwort als richtig
2. Spieler sieht grünes Feedback (✓)

1. Admin bewertet Antwort als falsch
2. Spieler sieht rotes Feedback (✗)

**Erwartetes Ergebnis:** Farb-Feedback erscheint kurz und verschwindet dann

### 11.8 Score-Delta-Animation

1. Admin bewertet Antwort
2. Score-Strip zeigt animierten Delta-Wert (+100 oder -50)

**Erwartetes Ergebnis:** Kurze Animation mit Punktänderung sichtbar

### 11.9 Sound-Effekte

1. Buzzer öffnet → Buzzer-Sound spielt
2. Richtige Antwort → Correct-Sound
3. Falsche Antwort → Wrong-Sound

**Erwartetes Ergebnis:** Töne sind hörbar (Lautstärke auf dem Gerät prüfen)

---

## 12. Player-Frontend – EndPage

**Ziel:** Finale Rangliste testen.

**Vorbereitung:** Admin hat Spiel beendet (Test 8.8).

### 12.1 Rangliste anzeigen

1. EndPage erscheint automatisch
2. Alle Spieler mit Scores in absteigender Reihenfolge

**Erwartetes Ergebnis:** Rangliste mit korrekter Reihenfolge

### 12.2 Medaillen

1. Platz 1 hat 🥇, Platz 2 🥈, Platz 3 🥉

**Erwartetes Ergebnis:** Medaillen-Emojis korrekt zugeordnet

### 12.3 Eigene Position hervorgehoben

1. Spieler sieht seinen eigenen Eintrag hervorgehoben

**Erwartetes Ergebnis:** Eigener Name/Score ist visuell unterscheidbar

### 12.4 "Neues Spiel"-Button

1. Button klicken
2. Navigation zurück zu `/`

**Erwartetes Ergebnis:** JoinPage erscheint

---

## 13. Vollständiger Spielablauf (Integration)

**Ziel:** Kompletten Spielablauf von Anfang bis Ende durchspielen.

**Setup:**
- 1× Admin-Browser (Desktop)
- 2× Player-Browser (Inkognito-Tab oder Smartphone)

### Phase 1 – Vorbereitung

1. Admin: `http://192.168.178.130/admin` öffnen
2. Admin: "Neuen Room erstellen" klicken → Code merken
3. Admin: Zur LobbyPage navigieren
4. Admin: Quiz hochladen – entweder:
   - **Per Terminal:** `curl -s -X POST http://192.168.178.130/api/rooms/$CODE/quiz -H "Content-Type: application/json" -d @/tmp/quiz.json`
   - **Per Browser:** `/admin/builder/jeopardy` öffnen → Import JSON → quiz.json auswählen → Room-Code eingeben → "Upload to Room"
5. Player 1: `http://192.168.178.130/` öffnen, Code eingeben, Name "Alice", beitreten
6. Player 2: Inkognito-Tab, gleiche URL, Name "Bob", beitreten
7. Admin: Beide Spieler erscheinen in der Lobby

**Checkpoint:** Beide Spieler sind online in der LobbyPage sichtbar ✓

### Phase 2 – Spielstart

8. Admin: Spieler-Reihenfolge prüfen (Alice zuerst, dann Bob)
9. Admin: "Spiel starten" klicken
10. Alle drei Clients navigieren automatisch zur Game-Ansicht

**Checkpoint:** Admin auf ControlPage, Player auf GamePage ✓

### Phase 3 – Erste Frage (Aktiver Spieler richtig)

11. Admin: "Geographie 100" klicken → Frage öffnet sich
12. Admin: Antwort aufdecken (Berlin)
13. Admin: "✓ Richtig" klicken
14. Alice bekommt +100 Punkte, Score-Update sichtbar

**Checkpoint:** Alice hat 100 Punkte, Bob hat 0 ✓

### Phase 4 – Zweite Frage (Aktiver Spieler falsch, Buzzer)

15. Admin: "Wissenschaft 100" klicken (nächste Frage, jetzt ist Bob aktiv)
16. Admin: "✗ Falsch" klicken → Buzzer-Phase startet, Bob bekommt -50
17. Alice: Buzzer-Button erscheint als aktiv (gold)
18. Alice: Buzzer klicken → Admin sieht "Alice hat gebuzzert"
19. Admin: Antwort aufdecken (H2O)
20. Admin: "✓ Richtig" klicken → Alice bekommt +50

**Checkpoint:** Alice hat 150, Bob hat -50 ✓

### Phase 5 – Negative Scores

21. Admin: Weitere Frage öffnen
22. Admin: "✗ Falsch" → Buzzer-Phase
23. Alice: Buzzert → Admin bewertet als Falsch
24. Alice Score sinkt unter Ausgangswert

**Checkpoint:** Negative Scores möglich und werden korrekt angezeigt ✓

### Phase 6 – Spielende

25. Admin: Alle Fragen spielen oder "Spiel beenden" klicken
26. Alle Clients zeigen GAME_OVER
27. Player-EndPage zeigt finale Rangliste

**Checkpoint:** Rangliste korrekt, Platz 1 mit höchstem Score ✓

---

## 14. Edge Cases & Fehlerszenarien

### 14.1 Player Disconnect & Reconnect

1. Spieler ist im Spiel
2. Browser-Tab schließen
3. Admin-LobbyPage/ControlPage: Spieler zeigt "Offline"-Badge
4. Gleichen Tab wieder öffnen, gleichen Code + Namen eingeben
5. Spieler reconnectet mit gleicher ID

**Erwartetes Ergebnis:** Score bleibt erhalten, Spieler erscheint wieder als "Online"

### 14.2 Multiple Buzzer gleichzeitig

1. Buzzer-Phase ist aktiv
2. Beide Spieler drücken gleichzeitig den Buzzer
3. Nur einer wird als gebuzzert angezeigt

**Erwartetes Ergebnis:** Erster Buzzer gewinnt, nur einer ist aktiv

### 14.3 Buzzer außerhalb der Phase

1. Phase ist `ACTIVE_PLAYER_ANSWERING` (nicht Buzzer-Phase)
2. Spieler versucht zu buzzern

**Erwartetes Ergebnis:** Buzzer wird ignoriert oder Fehlermeldung

### 14.4 Score manuell auf negativen Wert setzen

1. Admin klickt auf Score eines Spielers
2. Negativen Wert eingeben (z.B. `-999`)
3. Bestätigen

**Erwartetes Ergebnis:** Score wird auf -999 gesetzt, korrekt angezeigt

### 14.5 Spiel-Typ wechsel nur in LOBBY

1. Laufendes Spiel (IN_PROGRESS)
2. Versuche Spieltyp zu wechseln

**Erwartetes Ergebnis:** Wechsel ist nicht möglich (Button deaktiviert oder Fehler)

### 14.6 Quiz neu laden überschreibt altes

1. Quiz in Room laden
2. Anderes Quiz hochladen
3. Altes Board wird ersetzt

**Erwartetes Ergebnis:** Nur das neue Quiz ist aktiv

### 14.7 Room Auto-Cleanup

> Dieser Test dauert sehr lange – nur bei Bedarf durchführen.

1. Room erstellen, kein Spieler beitreten
2. 30 Minuten warten
3. Room erscheint nicht mehr in der Liste

**Erwartetes Ergebnis:** Leere LOBBY-Rooms werden nach 30 Min. gelöscht

### 14.8 Reconnect nach Admin-State

1. Admin ist auf ControlPage
2. Browser-Tab neu laden
3. Admin-State (Board, Scores, Phase) wird wiederhergestellt

**Erwartetes Ergebnis:** Admin sieht korrekten Spielzustand nach Reload

---

## 15. Checkliste

### Smoke Tests

- [ ] **ST-1** Backend API `/api/rooms` antwortet mit HTTP 200
- [ ] **ST-2** Admin-Frontend lädt ohne Fehler
- [ ] **ST-3** Player-Frontend lädt ohne Fehler
- [ ] **ST-4** WebSocket-Verbindung aufbaubar

### REST API – Room-Management

- [ ] **RM-1** POST /api/rooms → 6-stelliger Code, LOBBY-Phase
- [ ] **RM-2** GET /api/rooms → Room in der Liste
- [ ] **RM-3** GET /api/rooms/:code → Room-Details korrekt
- [ ] **RM-4** DELETE /api/rooms/:code → Room gelöscht, GET danach 404
- [ ] **RM-5** POST /players/order → HTTP 200
- [ ] **RM-6** POST /players/shuffle → HTTP 200

### REST API – Quiz & Media

- [ ] **QM-1** POST /quiz → Quiz hochladen, Board zurückgegeben
- [ ] **QM-2** GET /export → Quiz-JSON vollständig und korrekt
- [ ] **QM-3** POST /media/upload (PNG) → URL zurückgegeben
- [ ] **QM-4** GET /media/:file → HTTP 200, korrekter Content-Type
- [ ] **QM-5** POST /media/upload (TXT) → HTTP 400/415 Fehler

### Admin-Frontend – HomePage

- [ ] **AH-1** Rooms-Liste zeigt erstellte Rooms
- [ ] **AH-2** Neuen Room erstellen → erscheint in Liste
- [ ] **AH-3** LOBBY-Room öffnen → LobbyPage
- [ ] **AH-4** IN_PROGRESS-Room öffnen → ControlPage
- [ ] **AH-5** Room löschen mit Bestätigung → verschwindet aus Liste

### Admin-Frontend – LobbyPage

- [ ] **AL-1** QR-Code wird angezeigt
- [ ] **AL-2** QR-Code führt zum Player-Frontend
- [ ] **AL-3** Room-Code kopierbar
- [ ] **AL-4** Spieler erscheint live nach Join
- [ ] **AL-5** Drag & Drop Reihenfolge funktioniert
- [ ] **AL-6** Shuffle ändert Reihenfolge
- [ ] **AL-7** Spiel starten → ControlPage + Player auf GamePage

### Admin-Frontend – Quiz-Builder

- [ ] **QB-1** Builder-Seite lädt
- [ ] **QB-2** Kategorie hinzufügen
- [ ] **QB-3** Frage hinzufügen (Text, Antwort, Punkte)
- [ ] **QB-4** Media-Upload funktioniert
- [ ] **QB-5** Fragen Drag & Drop Reihenfolge
- [ ] **QB-6** JSON exportieren (Download)
- [ ] **QB-7** JSON importieren (Quiz erscheint im Builder)
- [ ] **QB-8** Quiz zu Room hochladen

### Admin-Frontend – ControlPage

- [ ] **AC-1** Board zeigt alle Kategorien und Fragen
- [ ] **AC-2** Frage öffnen → Overlay erscheint, Phase wechselt
- [ ] **AC-3** Antwort aufdecken
- [ ] **AC-4** Richtig bewerten → Punkte, Frage gespielt
- [ ] **AC-5** Falsch bewerten → Buzzer-Phase startet
- [ ] **AC-6** Buzzer-Antwort richtig bewerten → halbe Punkte
- [ ] **AC-7** Buzzer-Antwort falsch → nächster Spieler kann buzzern
- [ ] **AC-8** Score manuell editieren
- [ ] **AC-9** Spiel beenden → GAME_OVER, Player auf EndPage

### Player-Frontend – JoinPage

- [ ] **PJ-1** Seite lädt
- [ ] **PJ-2** Leerer Code → Button deaktiviert
- [ ] **PJ-3** Kleinbuchstaben werden automatisch großgeschrieben
- [ ] **PJ-4** Leerer Name → Fehlermeldung
- [ ] **PJ-5** Falscher Code → Fehlermeldung
- [ ] **PJ-6** Gültiger Join → WaitingPage
- [ ] **PJ-7** Enter-Taste funktioniert
- [ ] **PJ-8** Code-Dots zeigen Eingabe-Fortschritt

### Player-Frontend – WaitingPage

- [ ] **PW-1** "Warte auf Spiel"-Anzeige sichtbar
- [ ] **PW-2** Auto-Navigation zu GamePage bei Spielstart
- [ ] **PW-3** Auto-Navigation zu JoinPage wenn Room gelöscht

### Player-Frontend – JeopardyGame

- [ ] **PG-1** Board mit Kategorien und Fragen sichtbar
- [ ] **PG-2** Frage-Overlay erscheint bei QUESTION_OPENED
- [ ] **PG-3** Status-Bar zeigt Phase und aktiven Spieler
- [ ] **PG-4** Buzzer-Button inaktiv wenn nicht an der Reihe
- [ ] **PG-5** Buzzer-Button aktiv in Buzzer-Phase
- [ ] **PG-6** Buzzern per Klick
- [ ] **PG-7** Buzzern per Leertaste
- [ ] **PG-8** Antwort-Feedback grün bei richtig
- [ ] **PG-9** Antwort-Feedback rot bei falsch
- [ ] **PG-10** Score-Delta-Animation sichtbar
- [ ] **PG-11** Sound-Effekte (Buzzer, Richtig, Falsch)

### Player-Frontend – EndPage

- [ ] **PE-1** Rangliste in korrekter Reihenfolge
- [ ] **PE-2** Medaillen 🥇🥈🥉 korrekt
- [ ] **PE-3** Eigene Position hervorgehoben
- [ ] **PE-4** "Neues Spiel" → JoinPage

### Integration

- [ ] **IN-1** Vollständiger Spielablauf: Vorbereitung (Room + Quiz + Spieler)
- [ ] **IN-2** Vollständiger Spielablauf: Aktiver Spieler richtig → Punkte
- [ ] **IN-3** Vollständiger Spielablauf: Aktiver Spieler falsch → Buzzer-Phase
- [ ] **IN-4** Vollständiger Spielablauf: Buzzer richtig → halbe Punkte
- [ ] **IN-5** Vollständiger Spielablauf: Spielende → korrekte Rangliste

### Edge Cases

- [ ] **EC-1** Player disconnect → Offline-Badge
- [ ] **EC-2** Player reconnect → Score erhalten, wieder Online
- [ ] **EC-3** Simultaner Buzzer → nur erster wird angenommen
- [ ] **EC-4** Buzzer außerhalb Buzzer-Phase → ignoriert
- [ ] **EC-5** Score manuell auf negativen Wert setzen
- [ ] **EC-6** Spieltyp-Wechsel nur in LOBBY möglich
- [ ] **EC-7** Quiz neu laden überschreibt altes Board
- [ ] **EC-8** Admin-State nach Browser-Reload wiederhergestellt
