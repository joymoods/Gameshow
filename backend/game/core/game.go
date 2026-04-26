package core

type GameType string

const (
	GameTypeJeopardy GameType = "jeopardy"
)

// Game is the interface every game type must implement.
// The Room is the generic container; Game encapsulates all game-specific state.
type Game interface {
	// Type returns the game type identifier (used in GAME_STATE payload).
	Type() GameType

	// Snapshot returns the game-specific state for GAME_STATE broadcasts.
	Snapshot() map[string]any

	// HandleAdminCommand processes admin actions (open question, answer, reveal, …).
	HandleAdminCommand(cmd string, payload map[string]any) (any, error)

	// HandlePlayerMessage processes player WebSocket messages (e.g. BUZZ).
	// Returns nil if the message was accepted, non-nil if rejected.
	HandlePlayerMessage(playerID string, msgType string, payload map[string]any) error

	// OnStart is called when the room transitions from LOBBY → IN_PROGRESS.
	OnStart(room *Room) error
}
