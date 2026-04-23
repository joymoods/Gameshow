package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"jeopardy/game"
	"jeopardy/ws"
)

type Router struct {
	manager *game.Manager
	wsHandler *ws.Handler
}

func NewRouter(manager *game.Manager, wsHandler *ws.Handler) *Router {
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

// POST /api/rooms → create room
func (ro *Router) handleRooms(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	// Notify all currently connected player clients that the room is gone
	// so they return to the join screen instead of becoming ghost players.
	ro.wsHandler.ResetPlayerClients()
	room := ro.manager.CreateRoom()
	writeJSON(w, http.StatusCreated, map[string]string{"code": room.Code})
}

// Routes under /api/rooms/:code/...
func (ro *Router) handleRoomRoutes(w http.ResponseWriter, r *http.Request) {
	// Strip /api/rooms/
	path := strings.TrimPrefix(r.URL.Path, "/api/rooms/")
	parts := strings.SplitN(path, "/", 3)

	if len(parts) < 1 || parts[0] == "" {
		writeError(w, http.StatusBadRequest, "missing room code")
		return
	}

	code := parts[0]
	room := ro.manager.GetRoomByCode(code)
	if room == nil {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}

	// /api/rooms/:code (GET)
	if len(parts) == 1 {
		if r.Method == http.MethodGet {
			ro.handleGetRoom(w, r, room)
			return
		}
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	sub := parts[1]
	rest := ""
	if len(parts) == 3 {
		rest = parts[2]
	}

	switch sub {
	case "quiz":
		// POST /api/rooms/:code/quiz
		if r.Method == http.MethodPost {
			ro.handleUploadQuiz(w, r, room)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}

	case "export":
		// GET /api/rooms/:code/export
		if r.Method == http.MethodGet {
			ro.handleExportQuiz(w, r, room)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}

	case "start":
		// POST /api/rooms/:code/start
		if r.Method == http.MethodPost {
			ro.handleStartGame(w, r, room)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}

	case "end":
		// POST /api/rooms/:code/end
		if r.Method == http.MethodPost {
			ro.handleEndGame(w, r, room)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}

	case "question":
		// POST /api/rooms/:code/question/:id/open
		if r.Method == http.MethodPost && strings.HasSuffix(rest, "/open") {
			questionID := strings.TrimSuffix(rest, "/open")
			ro.handleOpenQuestion(w, r, room, questionID)
		} else {
			writeError(w, http.StatusNotFound, "not found")
		}

	case "answer":
		// POST /api/rooms/:code/answer
		if r.Method == http.MethodPost {
			ro.handleAnswer(w, r, room)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}

	case "players":
		// POST /api/rooms/:code/players/:id/score
		// POST /api/rooms/:code/players/order
		// POST /api/rooms/:code/players/shuffle
		ro.handlePlayerRoutes(w, r, room, rest)

	default:
		writeError(w, http.StatusNotFound, "not found")
	}
}

// GET /api/rooms/:code
func (ro *Router) handleGetRoom(w http.ResponseWriter, _ *http.Request, room *game.Room) {
	writeJSON(w, http.StatusOK, room.Snapshot())
}

// POST /api/rooms/:code/quiz
func (ro *Router) handleUploadQuiz(w http.ResponseWriter, r *http.Request, room *game.Room) {
	var categories []game.Category
	if err := json.NewDecoder(r.Body).Decode(&categories); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	room.SetCategories(categories)
	ro.wsHandler.BroadcastGameState()
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// GET /api/rooms/:code/export
func (ro *Router) handleExportQuiz(w http.ResponseWriter, _ *http.Request, room *game.Room) {
	snap := room.Snapshot()
	writeJSON(w, http.StatusOK, snap.Categories)
}

// POST /api/rooms/:code/start
func (ro *Router) handleStartGame(w http.ResponseWriter, r *http.Request, room *game.Room) {
	if room.ConnectedPlayerCount() == 0 {
		writeError(w, http.StatusBadRequest, "no players connected")
		return
	}
	room.SetPhase(game.PhaseQuestionOpen)
	active := room.ActivePlayer()
	ro.wsHandler.BroadcastGameState()
	if active != nil {
		ro.wsHandler.BroadcastActivePlayer(active)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "started"})
}

// POST /api/rooms/:code/end
func (ro *Router) handleEndGame(w http.ResponseWriter, _ *http.Request, room *game.Room) {
	room.SetPhase(game.PhaseGameOver)
	snap := room.Snapshot()
	ro.wsHandler.BroadcastGameOver(snap.Scores)
	writeJSON(w, http.StatusOK, map[string]string{"status": "game_over"})
}

// POST /api/rooms/:code/question/:id/open
func (ro *Router) handleOpenQuestion(w http.ResponseWriter, _ *http.Request, room *game.Room, questionID string) {
	phase := room.GetPhase()
	if phase != game.PhaseQuestionOpen {
		writeError(w, http.StatusBadRequest, "not in QUESTION_OPEN phase")
		return
	}

	q := room.GetQuestion(questionID)
	if q == nil {
		writeError(w, http.StatusNotFound, "question not found")
		return
	}
	if q.Played {
		writeError(w, http.StatusBadRequest, "question already played")
		return
	}

	room.SetCurrentQuestion(q)
	room.SetPhase(game.PhaseActivePlayerAnswering)
	room.ResetBuzzedPlayers()

	categoryName := room.GetCategoryName(questionID)
	ro.wsHandler.BroadcastQuestionOpened(q, categoryName)

	active := room.ActivePlayer()
	if active != nil {
		ro.wsHandler.BroadcastActivePlayer(active)
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// POST /api/rooms/:code/answer
// Body: { "playerId": "...", "correct": true/false }
func (ro *Router) handleAnswer(w http.ResponseWriter, r *http.Request, room *game.Room) {
	var body struct {
		PlayerID string `json:"playerId"`
		Correct  bool   `json:"correct"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	q := room.GetCurrentQuestion()
	if q == nil {
		writeError(w, http.StatusBadRequest, "no active question")
		return
	}

	delta, newScore := room.ApplyResult(body.PlayerID, body.Correct, q.Points)
	ro.wsHandler.BroadcastAnswerResult(body.PlayerID, body.Correct, delta, newScore)

	if body.Correct {
		// Correct: mark played, advance turn, back to board
		room.MarkQuestionPlayed(q.ID)
		ro.wsHandler.BroadcastBoardUpdate(q.ID)
		room.SetCurrentQuestion(nil)
		ro.wsHandler.BroadcastGameState()

		if room.AllQuestionsPlayed() {
			room.SetPhase(game.PhaseGameOver)
			snap := room.Snapshot()
			ro.wsHandler.BroadcastGameOver(snap.Scores)
		} else {
			room.NextActivePlayer()
			room.SetPhase(game.PhaseQuestionOpen)
			if active := room.ActivePlayer(); active != nil {
				ro.wsHandler.BroadcastActivePlayer(active)
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"delta": delta, "newScore": newScore})
		return
	}

	// Wrong answer
	if room.GetPhase() == game.PhaseActivePlayerAnswering {
		// Exclude active player so they cannot buzz for this question
		room.OpenBuzzerPhase(body.PlayerID)
		ro.wsHandler.BroadcastGameState()
		ro.wsHandler.BroadcastBuzzerOpen()
		writeJSON(w, http.StatusOK, map[string]any{"delta": delta, "newScore": newScore})
		return
	}

	// Wrong answer in buzzer phase — player already recorded in BuzzedPlayers by AttemptBuzz.
	// Reopen buzzer if any player still hasn't had a chance; otherwise end question.
	if room.HasRemainingBuzzers() {
		room.ReopenBuzzerPhase()
		ro.wsHandler.BroadcastGameState()
		ro.wsHandler.BroadcastBuzzerOpen()
	} else {
		room.MarkQuestionPlayed(q.ID)
		ro.wsHandler.BroadcastBoardUpdate(q.ID)
		room.SetCurrentQuestion(nil)
		ro.wsHandler.BroadcastGameState()

		if room.AllQuestionsPlayed() {
			room.SetPhase(game.PhaseGameOver)
			snap := room.Snapshot()
			ro.wsHandler.BroadcastGameOver(snap.Scores)
		} else {
			room.NextActivePlayer()
			room.SetPhase(game.PhaseQuestionOpen)
			if active := room.ActivePlayer(); active != nil {
				ro.wsHandler.BroadcastActivePlayer(active)
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"delta": delta, "newScore": newScore})
}

// Player sub-routes
func (ro *Router) handlePlayerRoutes(w http.ResponseWriter, r *http.Request, room *game.Room, rest string) {
	// POST /api/rooms/:code/players/order  → set player order
	if rest == "order" && r.Method == http.MethodPost {
		var ids []string
		if err := json.NewDecoder(r.Body).Decode(&ids); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		room.SetPlayerOrder(ids)
		ro.wsHandler.BroadcastGameState()
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}

	// POST /api/rooms/:code/players/shuffle → shuffle order
	if rest == "shuffle" && r.Method == http.MethodPost {
		room.ShufflePlayers()
		ro.wsHandler.BroadcastGameState()
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}

	// POST /api/rooms/:code/players/:id/score → manual score adjustment
	// rest = ":id/score"
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
		ro.wsHandler.BroadcastGameState()
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}

	writeError(w, http.StatusNotFound, "not found")
}
