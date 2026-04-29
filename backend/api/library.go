package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"games/game/core"
	"games/library"
)

// GET /api/library
// POST /api/library
func (ro *Router) handleLibraryCollection(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		summaries, err := ro.quizStore.List(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, summaries)

	case http.MethodPost:
		var body struct {
			Name        string          `json:"name"`
			Description string          `json:"description"`
			GameType    string          `json:"game_type"`
			Categories  []core.Category `json:"categories"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
			return
		}
		if body.Name == "" {
			writeError(w, http.StatusBadRequest, "name is required")
			return
		}
		if body.GameType == "" {
			body.GameType = "jeopardy"
		}
		summary, err := ro.quizStore.Create(r.Context(), body.Name, body.Description, body.GameType, body.Categories)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, summary)

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// Routes under /api/library/...
func (ro *Router) handleLibraryRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/library/")
	path = strings.TrimSuffix(path, "/")

	// POST /api/library/from-room/:code
	if strings.HasPrefix(path, "from-room/") {
		roomCode := strings.TrimPrefix(path, "from-room/")
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		ro.handleSaveRoomQuiz(w, r, roomCode)
		return
	}

	// /api/library/:id
	id := path
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing quiz id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		detail, err := ro.quizStore.Get(r.Context(), id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if detail == nil {
			writeError(w, http.StatusNotFound, "quiz not found")
			return
		}
		writeJSON(w, http.StatusOK, detail)

	case http.MethodPut:
		var body struct {
			Name        string          `json:"name"`
			Description string          `json:"description"`
			Categories  []core.Category `json:"categories"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
			return
		}
		if body.Name == "" {
			writeError(w, http.StatusBadRequest, "name is required")
			return
		}
		summary, err := ro.quizStore.Update(r.Context(), id, body.Name, body.Description, body.Categories)
		if err != nil && err.Error() == "quiz not found" {
			writeError(w, http.StatusNotFound, "quiz not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, summary)

	case http.MethodDelete:
		err := ro.quizStore.Delete(r.Context(), id)
		if err != nil && err.Error() == "quiz not found" {
			writeError(w, http.StatusNotFound, "quiz not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// POST /api/library/from-room/:code
// Saves the currently loaded quiz from a room into the library.
func (ro *Router) handleSaveRoomQuiz(w http.ResponseWriter, r *http.Request, roomCode string) {
	room, ok := ro.manager.GetRoom(roomCode)
	if !ok {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}
	snap := room.Snapshot()
	if len(snap.Categories) == 0 {
		writeError(w, http.StatusBadRequest, "room has no quiz loaded")
		return
	}

	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	summary, err := ro.quizStore.Create(r.Context(), body.Name, body.Description, string(room.GameType), snap.Categories)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, summary)
}

// POST /api/rooms/:code/quiz/library/:id
// Loads a quiz from the library into the room.
func (ro *Router) handleLoadFromLibrary(w http.ResponseWriter, r *http.Request, room *core.Room, quizID string) {
	detail, err := ro.quizStore.Get(r.Context(), quizID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if detail == nil {
		writeError(w, http.StatusNotFound, "quiz not found in library")
		return
	}

	categories := libraryToCore(detail)
	if _, err := room.Game.HandleAdminCommand("load_quiz", map[string]any{"categories": categories}); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	ro.wsHandler.BroadcastGameState(room)
	snap := room.Snapshot()
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "categories": snap.Categories})
}

func libraryToCore(detail *library.QuizDetail) []core.Category {
	cats := make([]core.Category, 0, len(detail.Categories))
	for _, c := range detail.Categories {
		questions := make([]core.Question, 0, len(c.Questions))
		for _, q := range c.Questions {
			questions = append(questions, core.Question{
				ID:         q.ID,
				CategoryID: q.CategoryID,
				Points:     q.Points,
				Text:       q.Text,
				Answer:     q.Answer,
				ImageURL:   q.ImageURL,
				AudioURL:   q.AudioURL,
				VideoURL:   q.VideoURL,
				Played:     false,
			})
		}
		cats = append(cats, core.Category{
			ID:        c.ID,
			Name:      c.Name,
			Questions: questions,
		})
	}
	return cats
}
