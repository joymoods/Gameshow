package ws

// ---- Incoming message types (Client → Server) ----

type IncomingMessage struct {
	Type    string          `json:"type"`
	Payload map[string]any  `json:"payload"`
}

// ---- Outgoing message types (Server → Client) ----

type OutgoingMessage struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

// Payload structs for outgoing messages

type GameStatePayload struct {
	Board         any    `json:"board"`
	Scores        any    `json:"scores"`
	ActivePlayers any    `json:"activePlayers"`
	CurrentPhase  string `json:"currentPhase"`
}

type QuestionOpenedPayload struct {
	QuestionID string `json:"questionId"`
	Category   string `json:"category"`
	Points     int    `json:"points"`
	Text       string `json:"text"`
	ImageURL   string `json:"imageUrl,omitempty"`
	AudioURL   string `json:"audioUrl,omitempty"`
	VideoURL   string `json:"videoUrl,omitempty"`
}

type ActivePlayerPayload struct {
	PlayerID   string `json:"playerId"`
	PlayerName string `json:"playerName"`
}

type PlayerBuzzedPayload struct {
	PlayerID   string `json:"playerId"`
	PlayerName string `json:"playerName"`
}

type AnswerResultPayload struct {
	PlayerID   string `json:"playerId"`
	Correct    bool   `json:"correct"`
	PointsDelta int   `json:"pointsDelta"`
	NewScore   int    `json:"newScore"`
}

type BoardUpdatePayload struct {
	QuestionID string `json:"questionId"`
	Played     bool   `json:"played"`
}

type GameOverPayload struct {
	FinalScores any `json:"finalScores"`
}

type PlayerJoinedPayload struct {
	PlayerID   string `json:"playerId"`
	PlayerName string `json:"playerName"`
}

type PlayerLeftPayload struct {
	PlayerID string `json:"playerId"`
}

type AnswerRevealedPayload struct {
	Answer string `json:"answer"`
}

type ErrorPayload struct {
	Message string `json:"message"`
}

// Message type constants
const (
	// Client → Server
	MsgJoinGame = "JOIN_GAME"
	MsgBuzz     = "BUZZ"

	// Server → All clients
	MsgGameState      = "GAME_STATE"
	MsgQuestionOpened = "QUESTION_OPENED"
	MsgActivePlayer   = "ACTIVE_PLAYER"
	MsgBuzzerOpen     = "BUZZER_OPEN"
	MsgPlayerBuzzed   = "PLAYER_BUZZED"
	MsgAnswerResult   = "ANSWER_RESULT"
	MsgAnswerRevealed = "ANSWER_REVEALED"
	MsgBoardUpdate    = "BOARD_UPDATE"
	MsgGameOver       = "GAME_OVER"

	// Server → Admin only
	MsgPlayerJoined = "PLAYER_JOINED"
	MsgPlayerLeft   = "PLAYER_LEFT"

	// Server → Client (error)
	MsgError = "ERROR"

	// Server → Player clients only (new room created by admin)
	MsgRoomReset = "ROOM_RESET"
)
