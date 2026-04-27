package jeopardy

import (
	"fmt"
	"sync"

	"games/game/core"
)

// JeopardyGame implements the core.Game interface.
// It owns all Jeopardy-specific state: categories, current question,
// buzzer state, and the internal phase machine.
type JeopardyGame struct {
	mu sync.Mutex

	room            *core.Room // set in OnStart; used for player score operations
	categories      []core.Category
	phase           JeopardyPhase
	currentQuestion *core.Question
	buzzedPlayerID  string
	buzzedPlayers   map[string]bool
}

func New() *JeopardyGame {
	return &JeopardyGame{
		buzzedPlayers: make(map[string]bool),
	}
}

// ---- core.Game interface ----

func (j *JeopardyGame) Type() core.GameType {
	return core.GameTypeJeopardy
}

// Snapshot returns the Jeopardy-specific state for GAME_STATE broadcasts.
// Keys "board" and "current_phase" are consumed by Room.Snapshot() to populate
// the backward-compatible GAME_STATE payload.
func (j *JeopardyGame) Snapshot() map[string]any {
	j.mu.Lock()
	defer j.mu.Unlock()

	cats := make([]core.Category, len(j.categories))
	copy(cats, j.categories)

	var currentQ any
	if j.currentQuestion != nil {
		q := *j.currentQuestion
		currentQ = q
	}

	return map[string]any{
		"board":            cats,
		"current_phase":    string(j.phase),
		"current_question": currentQ,
		"buzzed_player_id": j.buzzedPlayerID,
	}
}

// HandleAdminCommand dispatches admin actions. Supported commands:
//
//	load_quiz      payload: {"categories": []core.Category}
//	open_question  payload: {"questionId": string}
//	answer         payload: {"playerId": string, "correct": bool}
//	close_question payload: {}
//	reveal         payload: {}
//	end_buzzer     payload: {}
func (j *JeopardyGame) HandleAdminCommand(cmd string, payload map[string]any) (any, error) {
	j.mu.Lock()
	defer j.mu.Unlock()

	switch cmd {
	case "load_quiz":
		return j.loadQuiz(payload)
	case "open_question":
		return j.openQuestion(payload)
	case "answer":
		return j.answer(payload)
	case "close_question":
		return j.closeQuestion()
	case "reveal":
		return j.reveal()
	case "end_buzzer":
		return j.endBuzzer()
	default:
		return nil, fmt.Errorf("unknown command: %s", cmd)
	}
}

// HandlePlayerMessage handles player WebSocket messages.
// Returns nil if the BUZZ was accepted, non-nil if rejected.
func (j *JeopardyGame) HandlePlayerMessage(playerID string, msgType string, _ map[string]any) error {
	if msgType != "BUZZ" {
		return fmt.Errorf("unknown message type: %s", msgType)
	}

	j.mu.Lock()
	defer j.mu.Unlock()

	if j.phase != PhaseBuzzerPhase {
		return fmt.Errorf("not in buzzer phase")
	}
	if j.buzzedPlayers[playerID] {
		return fmt.Errorf("player already buzzed")
	}
	if j.buzzedPlayerID != "" {
		return fmt.Errorf("buzzer already taken")
	}

	j.buzzedPlayerID = playerID
	j.buzzedPlayers[playerID] = true
	return nil
}

// OnStart is called when the room transitions LOBBY → IN_PROGRESS.
func (j *JeopardyGame) OnStart(room *core.Room) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.room = room
	j.phase = PhaseQuestionOpen
	return nil
}

// ---- internal command handlers (called with j.mu held) ----

func (j *JeopardyGame) loadQuiz(payload map[string]any) (any, error) {
	cats, ok := payload["categories"].([]core.Category)
	if !ok {
		return nil, fmt.Errorf("invalid categories payload")
	}
	j.categories = cats
	return map[string]any{"status": "ok"}, nil
}

func (j *JeopardyGame) openQuestion(payload map[string]any) (any, error) {
	if j.phase != PhaseQuestionOpen {
		return nil, fmt.Errorf("not in QUESTION_OPEN phase")
	}

	qID, _ := payload["questionId"].(string)
	q := j.findQuestion(qID)
	if q == nil {
		return nil, fmt.Errorf("question not found")
	}
	if q.Played {
		return nil, fmt.Errorf("question already played")
	}

	catName := j.findCategoryName(qID)
	j.currentQuestion = q
	j.phase = PhaseActivePlayerAnswering
	j.buzzedPlayers = make(map[string]bool)
	j.buzzedPlayerID = ""

	var activePlayer *core.Player
	if j.room != nil {
		activePlayer = j.room.ActivePlayer()
	}

	return map[string]any{
		"question":     q,
		"categoryName": catName,
		"activePlayer": activePlayer,
	}, nil
}

func (j *JeopardyGame) answer(payload map[string]any) (any, error) {
	playerID, _ := payload["playerId"].(string)
	correct, _ := payload["correct"].(bool)

	if j.currentQuestion == nil {
		return nil, fmt.Errorf("no active question")
	}
	if j.phase != PhaseActivePlayerAnswering && j.phase != PhaseBuzzerPhase {
		return nil, fmt.Errorf("cannot judge answer in phase %s", j.phase)
	}
	if j.phase == PhaseActivePlayerAnswering {
		active := j.room.ActivePlayer()
		if active == nil || active.ID != playerID {
			return nil, fmt.Errorf("player is not the active player")
		}
	} else {
		if playerID != j.buzzedPlayerID {
			return nil, fmt.Errorf("player has not buzzed")
		}
	}

	points := j.currentQuestion.Points
	// Half points for buzzer-phase correct answers
	if correct && j.phase == PhaseBuzzerPhase {
		points = points / 2
	}

	// ApplyResult acquires room.mu — safe because we don't hold room.mu here.
	delta, newScore := j.room.ApplyResult(playerID, correct, points)

	buzzerOpen := false
	if correct {
		j.phase = PhaseQuestionDone
	} else if j.phase == PhaseActivePlayerAnswering {
		// Active player answered wrong → open buzzer, exclude them
		j.buzzedPlayers[playerID] = true
		j.buzzedPlayerID = ""
		j.phase = PhaseBuzzerPhase
		buzzerOpen = true
	} else {
		// Wrong answer in buzzer phase — playerID already added by HandlePlayerMessage
		j.buzzedPlayerID = ""
		if j.hasRemainingBuzzers() {
			j.phase = PhaseBuzzerPhase
			buzzerOpen = true
		} else {
			j.phase = PhaseQuestionDone
		}
	}

	return map[string]any{
		"delta":      delta,
		"newScore":   newScore,
		"buzzerOpen": buzzerOpen,
	}, nil
}

func (j *JeopardyGame) closeQuestion() (any, error) {
	questionID := ""
	if j.currentQuestion != nil {
		questionID = j.currentQuestion.ID
		j.markQuestionPlayed(questionID)
		j.currentQuestion = nil
	}
	j.buzzedPlayers = make(map[string]bool)
	j.buzzedPlayerID = ""

	gameOver := j.allQuestionsPlayed()
	var activePlayer *core.Player
	if !gameOver {
		if j.room != nil {
			// NextActivePlayer + ActivePlayer each acquire room.mu — no j.mu nesting.
			j.room.NextActivePlayer()
			activePlayer = j.room.ActivePlayer()
		}
		j.phase = PhaseQuestionOpen
	} else {
		j.phase = PhaseGameOver
	}

	return map[string]any{
		"questionId":   questionID,
		"gameOver":     gameOver,
		"activePlayer": activePlayer,
	}, nil
}

func (j *JeopardyGame) reveal() (any, error) {
	answer := ""
	if j.currentQuestion != nil {
		answer = j.currentQuestion.Answer
	}
	return map[string]any{"answer": answer}, nil
}

func (j *JeopardyGame) endBuzzer() (any, error) {
	if j.phase != PhaseBuzzerPhase {
		return nil, fmt.Errorf("not in buzzer phase")
	}
	j.phase = PhaseQuestionDone
	return map[string]any{"status": "ok"}, nil
}

// ---- internal helpers (called with j.mu held) ----

func (j *JeopardyGame) findQuestion(id string) *core.Question {
	for i := range j.categories {
		for k := range j.categories[i].Questions {
			if j.categories[i].Questions[k].ID == id {
				q := j.categories[i].Questions[k]
				return &q
			}
		}
	}
	return nil
}

func (j *JeopardyGame) findCategoryName(questionID string) string {
	for _, cat := range j.categories {
		for _, q := range cat.Questions {
			if q.ID == questionID {
				return cat.Name
			}
		}
	}
	return ""
}

func (j *JeopardyGame) markQuestionPlayed(id string) {
	for i := range j.categories {
		for k := range j.categories[i].Questions {
			if j.categories[i].Questions[k].ID == id {
				j.categories[i].Questions[k].Played = true
				return
			}
		}
	}
}

func (j *JeopardyGame) allQuestionsPlayed() bool {
	for _, cat := range j.categories {
		for _, q := range cat.Questions {
			if !q.Played {
				return false
			}
		}
	}
	return true
}

// hasRemainingBuzzers returns true if any connected player hasn't buzzed yet.
// Calls room.ConnectedPlayerIDs() which acquires room.mu — safe since we hold j.mu only.
func (j *JeopardyGame) hasRemainingBuzzers() bool {
	if j.room == nil {
		return false
	}
	for _, id := range j.room.ConnectedPlayerIDs() {
		if !j.buzzedPlayers[id] {
			return true
		}
	}
	return false
}
