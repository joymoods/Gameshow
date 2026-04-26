package game

import "games/game/core"

// Manager is the multi-room registry. Type alias so existing imports keep working.
type Manager = core.Manager

func NewManager() *Manager {
	return core.NewManager()
}
