package ws

// ---- Incoming message types (Client → Server) ----

type IncomingMessage struct {
	Type    string         `json:"type"`
	Payload map[string]any `json:"payload"`
}

// ---- Outgoing message types (Server → Client) ----

type OutgoingMessage struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

// Generic payload structs (game-type-agnostic)

type GameStatePayload struct {
	Board         any    `json:"board"`
	Scores        any    `json:"scores"`
	ActivePlayers any    `json:"activePlayers"`
	CurrentPhase  string `json:"currentPhase"`
}

type ActivePlayerPayload struct {
	PlayerID   string `json:"playerId"`
	PlayerName string `json:"playerName"`
}

type PlayerBuzzedPayload struct {
	PlayerID   string `json:"playerId"`
	PlayerName string `json:"playerName"`
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

type ErrorPayload struct {
	Message string `json:"message"`
}

type GameSwitchedPayload struct {
	GameType string `json:"game_type"`
}

// Message type constants
const (
	// Client → Server
	MsgJoinGame = "JOIN_GAME"
	MsgBuzz     = "BUZZ"
	MsgPing     = "PING"

	// Server → Client
	MsgPong = "PONG"

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

	// Server → All clients (game type changed in lobby)
	MsgGameSwitched = "GAME_SWITCHED"

	// Timer
	MsgTimerStarted = "TIMER_STARTED"
	MsgTimerStopped = "TIMER_STOPPED"

	// WebRTC signaling — relayed between peers
	MsgWebRTCOffer  = "WEBRTC_OFFER"
	MsgWebRTCAnswer = "WEBRTC_ANSWER"
	MsgWebRTCIce    = "WEBRTC_ICE"

	// Camera presence
	MsgCamOn    = "CAM_ON"
	MsgCamOff   = "CAM_OFF"
	MsgCamState = "CAM_STATE"
)

// CamInfo holds the peer-visible identity of a camera-enabled client.
type CamInfo struct {
	PeerID string `json:"from"`
	Name   string `json:"name"`
}
