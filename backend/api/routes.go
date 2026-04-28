package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"games/game/core"
	"games/game/jeopardy"
	"games/ws"
)

type Router struct {
	manager   *core.Manager
	wsHandler *ws.Handler
}

func NewRouter(manager *core.Manager, wsHandler *ws.Handler) *Router {
	return &Router{manager: manager, wsHandler: wsHandler}
}

func (ro *Router) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/rooms", ro.withCORS(ro.handleRooms))
	mux.HandleFunc("/api/rooms/", ro.withCORS(ro.handleRoomRoutes))
}

func (ro *Router) withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// GET /api/rooms → list all active rooms
// POST /api/rooms → create room; body: {"game_type": "jeopardy"}
func (ro *Router) handleRooms(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rooms := ro.manager.ListRooms()
		snapshots := make([]core.RoomSnapshot, 0, len(rooms))
		for _, room := range rooms {
			snapshots = append(snapshots, room.Snapshot())
		}
		writeJSON(w, http.StatusOK, snapshots)

	case http.MethodPost:
		var body struct {
			GameType core.GameType `json:"game_type"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.GameType == "" {
			writeError(w, http.StatusBadRequest, "game_type is required")
			return
		}
		if body.GameType != core.GameTypeJeopardy {
			writeError(w, http.StatusBadRequest, "unsupported game_type: "+string(body.GameType))
			return
		}
		room := ro.manager.CreateRoom()
		room.GameType = core.GameTypeJeopardy
		room.Game = jeopardy.New()
		writeJSON(w, http.StatusCreated, map[string]string{
			"code":       room.Code,
			"room_phase": string(room.Phase),
			"game_type":  string(room.GameType),
		})

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// Routes under /api/rooms/:code/...
func (ro *Router) handleRoomRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/rooms/")
	parts := strings.SplitN(path, "/", 3)

	if len(parts) < 1 || parts[0] == "" {
		writeError(w, http.StatusBadRequest, "missing room code")
		return
	}

	code := parts[0]
	room, ok := ro.manager.GetRoom(code)
	if !ok {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}

	// /api/rooms/:code (GET, DELETE)
	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, http.StatusOK, room.Snapshot())
		case http.MethodDelete:
			ro.handleDeleteRoom(w, r, code)
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}

	sub := parts[1]
	rest := ""
	if len(parts) == 3 {
		rest = parts[2]
	}

	switch sub {
	case "quiz":
		if r.Method == http.MethodPost {
			ro.handleUploadQuiz(w, r, room)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}

	case "export":
		if r.Method == http.MethodGet {
			ro.handleExportQuiz(w, r, room)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}

	case "start":
		if r.Method == http.MethodPost {
			ro.handleStartGame(w, r, room)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}

	case "end":
		if r.Method == http.MethodPost {
			ro.handleEndGame(w, r, room)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}

	case "question":
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		switch {
		case strings.HasSuffix(rest, "/open"):
			ro.handleOpenQuestion(w, r, room, strings.TrimSuffix(rest, "/open"))
		case rest == "close":
			ro.handleCloseQuestion(w, r, room)
		case rest == "reveal":
			ro.handleRevealAnswer(w, r, room)
		case rest == "end-buzzer":
			ro.handleEndBuzzerPhase(w, r, room)
		default:
			writeError(w, http.StatusNotFound, "not found")
		}

	case "answer":
		if r.Method == http.MethodPost {
			ro.handleAnswer(w, r, room)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}

	case "game":
		if r.Method == http.MethodPost {
			ro.handleSwitchGame(w, r, room)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}

	case "players":
		ro.handlePlayerRoutes(w, r, room, rest)

	default:
		writeError(w, http.StatusNotFound, "not found")
	}
}

// POST /api/rooms/:code/quiz
// Delegates to HandleAdminCommand("load_quiz") so the game owns the board state.
func (ro *Router) handleUploadQuiz(w http.ResponseWriter, r *http.Request, room *core.Room) {
	if room.Game == nil {
		writeError(w, http.StatusBadRequest, "no game initialised")
		return
	}
	var categories []core.Category
	if err := json.NewDecoder(r.Body).Decode(&categories); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if _, err := room.Game.HandleAdminCommand("load_quiz", map[string]any{"categories": categories}); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	ro.wsHandler.BroadcastGameState(room)
	snap := room.Snapshot()
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "categories": snap.Categories})
}

// GET /api/rooms/:code/export
func (ro *Router) handleExportQuiz(w http.ResponseWriter, _ *http.Request, room *core.Room) {
	snap := room.Snapshot()
	writeJSON(w, http.StatusOK, snap.Categories)
}

// POST /api/rooms/:code/start
func (ro *Router) handleStartGame(w http.ResponseWriter, r *http.Request, room *core.Room) {
	if room.ConnectedPlayerCount() == 0 {
		writeError(w, http.StatusBadRequest, "no players connected")
		return
	}
	if room.Game == nil {
		writeError(w, http.StatusBadRequest, "no game initialised")
		return
	}
	if err := room.Game.OnStart(room); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	room.SetPhase(core.RoomPhaseInProgress)
	active := room.ActivePlayer()
	ro.wsHandler.BroadcastGameState(room)
	if active != nil {
		ro.wsHandler.BroadcastActivePlayer(active)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "started"})
}

// POST /api/rooms/:code/end
func (ro *Router) handleEndGame(w http.ResponseWriter, _ *http.Request, room *core.Room) {
	room.SetPhase(core.RoomPhaseGameOver)
	snap := room.Snapshot()
	ro.wsHandler.BroadcastGameOver(snap.Scores)
	writeJSON(w, http.StatusOK, map[string]string{"status": "game_over"})
}

// POST /api/rooms/:code/question/:id/open
func (ro *Router) handleOpenQuestion(w http.ResponseWriter, _ *http.Request, room *core.Room, questionID string) {
	if room.Game == nil {
		writeError(w, http.StatusBadRequest, "no game initialised")
		return
	}
	result, err := room.Game.HandleAdminCommand("open_question", map[string]any{"questionId": questionID})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	res := result.(map[string]any)
	q, _ := res["question"].(*core.Question)
	catName, _ := res["categoryName"].(string)
	activePlayer, _ := res["activePlayer"].(*core.Player)

	if q != nil {
		ro.wsHandler.BroadcastQuestionOpened(q, catName)
	}
	if activePlayer != nil {
		ro.wsHandler.BroadcastActivePlayer(activePlayer)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// POST /api/rooms/:code/answer
// Body: { "playerId": "...", "correct": true/false }
func (ro *Router) handleAnswer(w http.ResponseWriter, r *http.Request, room *core.Room) {
	if room.Game == nil {
		writeError(w, http.StatusBadRequest, "no game initialised")
		return
	}
	var body struct {
		PlayerID string `json:"playerId"`
		Correct  bool   `json:"correct"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	result, err := room.Game.HandleAdminCommand("answer", map[string]any{
		"playerId": body.PlayerID,
		"correct":  body.Correct,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	res := result.(map[string]any)
	delta, _ := res["delta"].(int)
	newScore, _ := res["newScore"].(int)
	buzzerOpen, _ := res["buzzerOpen"].(bool)

	ro.wsHandler.BroadcastAnswerResult(body.PlayerID, body.Correct, delta, newScore)

	if buzzerOpen {
		ro.wsHandler.BroadcastGameState(room)
		ro.wsHandler.BroadcastBuzzerOpen()
	} else {
		ro.wsHandler.BroadcastGameState(room)
	}

	writeJSON(w, http.StatusOK, map[string]any{"delta": delta, "newScore": newScore})
}

// Player sub-routes
func (ro *Router) handlePlayerRoutes(w http.ResponseWriter, r *http.Request, room *core.Room, rest string) {
	if rest == "order" && r.Method == http.MethodPost {
		var ids []string
		if err := json.NewDecoder(r.Body).Decode(&ids); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		room.SetPlayerOrder(ids)
		ro.wsHandler.BroadcastGameState(room)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}

	if rest == "shuffle" && r.Method == http.MethodPost {
		room.ShufflePlayers()
		ro.wsHandler.BroadcastGameState(room)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}

	parts := strings.SplitN(rest, "/", 2)
	if len(parts) == 2 && parts[1] == "score" && r.Method == http.MethodPost {
		playerID := parts[0]
		var body struct {
			Score int `json:"score"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if !room.AdjustScore(playerID, body.Score) {
			writeError(w, http.StatusNotFound, "player not found")
			return
		}
		ro.wsHandler.BroadcastGameState(room)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}

	writeError(w, http.StatusNotFound, "not found")
}

// POST /api/rooms/:code/question/close
func (ro *Router) handleCloseQuestion(w http.ResponseWriter, _ *http.Request, room *core.Room) {
	if room.Game == nil {
		writeError(w, http.StatusBadRequest, "no game initialised")
		return
	}
	result, err := room.Game.HandleAdminCommand("close_question", map[string]any{})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	res := result.(map[string]any)
	questionID, _ := res["questionId"].(string)
	gameOver, _ := res["gameOver"].(bool)
	activePlayer, _ := res["activePlayer"].(*core.Player)

	if questionID != "" {
		ro.wsHandler.BroadcastBoardUpdate(questionID)
	}
	if gameOver {
		room.SetPhase(core.RoomPhaseGameOver)
		snap := room.Snapshot()
		ro.wsHandler.BroadcastGameOver(snap.Scores)
	} else {
		ro.wsHandler.BroadcastGameState(room)
		if activePlayer != nil {
			ro.wsHandler.BroadcastActivePlayer(activePlayer)
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// POST /api/rooms/:code/question/reveal
func (ro *Router) handleRevealAnswer(w http.ResponseWriter, _ *http.Request, room *core.Room) {
	if room.Game == nil {
		writeError(w, http.StatusBadRequest, "no game initialised")
		return
	}
	result, err := room.Game.HandleAdminCommand("reveal", map[string]any{})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	answer, _ := result.(map[string]any)["answer"].(string)
	ro.wsHandler.BroadcastAnswerRevealed(answer)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// POST /api/rooms/:code/game
// Switches the game type; only allowed when room is in LOBBY phase.
func (ro *Router) handleSwitchGame(w http.ResponseWriter, r *http.Request, room *core.Room) {
	if room.GetPhase() != core.RoomPhaseLobby {
		writeError(w, http.StatusConflict, "game can only be switched in LOBBY phase")
		return
	}
	var body struct {
		GameType core.GameType `json:"game_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.GameType == "" {
		writeError(w, http.StatusBadRequest, "game_type is required")
		return
	}
	if body.GameType != core.GameTypeJeopardy {
		writeError(w, http.StatusBadRequest, "unsupported game_type: "+string(body.GameType))
		return
	}
	// Only replace the game instance when the type actually changes.
	// Replacing on the same type would wipe any loaded quiz data.
	if room.GameType != body.GameType {
		room.GameType = body.GameType
		room.Game = jeopardy.New()
	}
	ro.wsHandler.BroadcastGameSwitched(string(body.GameType))
	ro.wsHandler.BroadcastGameState(room)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// DELETE /api/rooms/:code
func (ro *Router) handleDeleteRoom(w http.ResponseWriter, _ *http.Request, code string) {
	ro.wsHandler.ResetRoomPlayers(code)
	ro.manager.DeleteRoom(code)
	writeJSON(w, http.StatusOK, map[string]string{"status": "closed"})
}

// POST /api/rooms/:code/question/end-buzzer
func (ro *Router) handleEndBuzzerPhase(w http.ResponseWriter, _ *http.Request, room *core.Room) {
	if room.Game == nil {
		writeError(w, http.StatusBadRequest, "no game initialised")
		return
	}
	if _, err := room.Game.HandleAdminCommand("end_buzzer", map[string]any{}); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	ro.wsHandler.BroadcastGameState(room)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
