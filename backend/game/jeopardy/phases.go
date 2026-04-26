package jeopardy

// JeopardyPhase is the internal phase state of a Jeopardy game.
// It is intentionally separate from the generic RoomPhase introduced in Phase 3.
type JeopardyPhase string

const (
	PhaseQuestionOpen          JeopardyPhase = "QUESTION_OPEN"
	PhaseActivePlayerAnswering JeopardyPhase = "ACTIVE_PLAYER_ANSWERING"
	PhaseBuzzerPhase           JeopardyPhase = "BUZZER_PHASE"
	PhaseQuestionDone          JeopardyPhase = "QUESTION_DONE"
	PhaseGameOver              JeopardyPhase = "GAME_OVER"
)
