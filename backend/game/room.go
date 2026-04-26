package game

import "games/game/core"

// Type aliases – existing code in api/ and ws/ keeps working without import changes.
type Room = core.Room
type Player = core.Player
type RoomSnapshot = core.RoomSnapshot
type GameType = core.GameType
type RoomPhase = core.RoomPhase

const (
	GameTypeJeopardy    = core.GameTypeJeopardy
	RoomPhaseLobby      = core.RoomPhaseLobby
	RoomPhaseInProgress = core.RoomPhaseInProgress
	RoomPhaseGameOver   = core.RoomPhaseGameOver
)
