# Jeopardy Quiz App — Projektübersicht

## Konzept

Eine Echtzeit-Jeopardy-Web-App mit zwei separaten Frontends: eines für den Moderator/Admin und eines für die Teilnehmer. Die Kommunikation läuft über WebSockets, sodass alle Clients den Spielstand in Echtzeit synchronisiert bekommen.

---

## Architektur

```
jeopardy/
├── backend/              → Go-Server (WebSocket + REST API)
├── admin-frontend/       → React + TypeScript + Vite (Moderator)
├── player-frontend/      → React + TypeScript + Vite (Teilnehmer)
└── docs/                 → Dokumentation (diese Dateien)
```

---

## Tech-Stack

| Bereich | Technologie |
|---|---|
| Backend | Go, nhooyr.io/websocket, net/http |
| Admin-Frontend | React, TypeScript, Vite |
| Player-Frontend | React, TypeScript, Vite |
| Medien-Upload | Multipart HTTP, lokal gespeichert (oder S3-kompatibel) |
| State | In-Memory (kein DB erforderlich für MVP) |

---

## Spielmechanik

### Board
- Der Moderator erstellt beliebig viele Kategorien mit je beliebig vielen Fragen
- Jede Frage hat einen Punktwert (z.B. 200, 400, 600, 800, 1000)
- Das Board zeigt alle Kategorien und Punktwerte — bereits gespielte Felder werden ausgeblendet

### Spielreihenfolge
1. Moderator wählt eine Frage vom Board aus
2. Die Frage wird allen Spielern angezeigt (Text, Bild, Audio oder Video)
3. Der **aktive Spieler** (reihum) beantwortet zuerst — kein Buzzer nötig
4. Moderator bewertet die Antwort als **richtig** oder **falsch**

### Falsch-Antwort → Buzzer-Phase
- Bei falscher Antwort des aktiven Spielers öffnet sich die Buzzer-Phase
- Alle anderen Spieler können buzzern
- Der erste Buzzer darf antworten
- Moderator bewertet erneut
- Weitere Buzzer-Runden möglich bis alle gepasst haben oder jemand richtig liegt

### Punktesystem
| Ergebnis | Punkte |
|---|---|
| Richtig | + voller Fragenwert |
| Falsch | - halber Fragenwert |

*Beispiel: Frage mit 500 Punkten → Richtig: +500, Falsch: -250*

---

## Frageformate

Fragen können folgende Medien enthalten (einzeln oder kombiniert):
- **Text** (Pflichtfeld)
- **Bild** (JPG, PNG, GIF, WebP)
- **Audio** (MP3, WAV, OGG)
- **Video** (MP4, WebM)

---

## WebSocket Message-Types

```
Client → Server:
  JOIN_GAME           { roomCode, playerName }
  BUZZ                { playerId }
  
Server → Clients:
  GAME_STATE          { board, scores, activePlayers, currentPhase }
  QUESTION_OPENED     { questionId, category, points, content }
  ACTIVE_PLAYER       { playerId, playerName }
  BUZZER_OPEN         {}
  PLAYER_BUZZED       { playerId, playerName }
  ANSWER_RESULT       { playerId, correct, pointsDelta, newScore }
  BOARD_UPDATE        { questionId, played: true }
  GAME_OVER           { finalScores }

Server → Admin only:
  PLAYER_JOINED       { playerId, playerName }
  PLAYER_LEFT         { playerId }
```

---

## Admin-Frontend — Funktionsumfang

### Quiz-Builder
- Kategorien erstellen, umbenennen, löschen
- Fragen pro Kategorie erstellen mit Punktwert, Fragetext und optionalen Medien
- Medien hochladen (Bild, Audio, Video)
- Quiz speichern / laden (JSON-Export/Import)

### Lobby
- Room-Code anzeigen (Spieler treten damit bei)
- Liste der verbundenen Spieler sehen
- Spielerreihenfolge festlegen oder zufällig würfeln
- Spiel starten

### Control Panel (während des Spiels)
- Board-Ansicht: Frage auswählen und öffnen
- Aktiven Spieler sehen
- Buzzer-Phase manuell öffnen/schließen
- Antwort als richtig/falsch markieren
- Scores manuell korrigieren (Notfall)
- Nächsten Spieler setzen
- Spiel beenden / Endscreen anzeigen

---

## Player-Frontend — Funktionsumfang

### Join-Screen
- Room-Code eingeben
- Namen eingeben
- Beitreten

### Spielansicht
- Board anschauen (read-only)
- Aktuelle Frage angezeigt bekommen (Text, Bild, Audio, Video)
- Anzeige wer gerade dran ist
- **Buzzer-Button** (prominent, reaktionsschnell) — nur aktiv wenn Buzzer-Phase offen
- Eigener Score immer sichtbar
- Leaderboard nach jeder Frage

### Endscreen
- Finale Rangliste mit allen Scores

---

## Room-System

- Jedes Spiel hat einen eindeutigen **Room-Code** (z.B. 6-stellig alphanumerisch)
- Admin erstellt den Room, Spieler treten per Code bei
- Room-State lebt im Backend in-memory (kein Persist nötig für MVP)
- Reconnect-Handling: Spieler können mit gleichem Namen neu verbinden

---

## MVP-Scope (Phase 1)

Folgendes ist im ersten Build enthalten:
- Backend mit WebSocket + REST
- Admin: Quiz-Builder, Lobby, Control Panel
- Player: Join, Board-View, Buzzer, Score
- Alle Frageformate (Text, Bild, Audio, Video)
- Punktesystem mit Abzügen
- Buzzer-Phase nach Falschantwort
- Endscreen

Folgendes ist **nicht** im MVP:
- Persistenz (Datenbank)
- User-Authentifizierung für Admin (vorerst kein Login)
- Multiple aktive Rooms gleichzeitig (vorerst ein Room pro Server)
- Statistiken / Spielhistorie
