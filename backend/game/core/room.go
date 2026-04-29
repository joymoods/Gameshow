package core

import (
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// RoomPhase is the top-level lifecycle state of a room, independent of game logic.
type RoomPhase string

const (
	RoomPhaseLobby      RoomPhase = "LOBBY"
	RoomPhaseInProgress RoomPhase = "IN_PROGRESS"
	RoomPhaseGameOver   RoomPhase = "GAME_OVER"
)

// RoomSnapshot is the serialisable state sent to clients.
// Categories and CurrentPhase are populated from Game.Snapshot() in Room.Snapshot().
type RoomSnapshot struct {
	Code           string         `json:"roomCode"`
	Categories     []Category     `json:"board"`
	Scores         []Player       `json:"scores"`
	PlayerOrder    []string       `json:"activePlayers"`
	CurrentPhase   string         `json:"currentPhase"`
	GameType       string         `json:"game_type"`
	RoomPhase      string         `json:"room_phase"`
	ActivePlayerID string         `json:"active_player_id,omitempty"`
	GameState      map[string]any `json:"game_state,omitempty"`
}

// Room is the generic container. It knows players and order but no game logic.
type Room struct {
	mu sync.RWMutex

	Code              string
	Players           []*Player
	PlayerOrder       []string
	ActivePlayerIndex int
	Phase             RoomPhase // top-level lifecycle state
	GameType          GameType  // set when room is created
	Game              Game      // nil until a game is assigned
	CreatedAt         time.Time
}

func newRoom() *Room {
	return &Room{
		Code:        generateCode(),
		Players:     []*Player{},
		PlayerOrder: []string{},
		Phase:       RoomPhaseLobby,
		CreatedAt:   time.Now(),
	}
}

func (r *Room) GetPhase() RoomPhase {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.Phase
}

func (r *Room) SetPhase(phase RoomPhase) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Phase = phase
}

func (r *Room) AddPlayer(name string) (*Player, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, p := range r.Players {
		if strings.EqualFold(p.Name, name) {
			p.Connected = true
			return p, false
		}
	}

	p := &Player{
		ID:        uuid.NewString(),
		Name:      name,
		Score:     0,
		Connected: true,
	}
	r.Players = append(r.Players, p)
	r.PlayerOrder = append(r.PlayerOrder, p.ID)
	return p, true
}

func (r *Room) RemovePlayer(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, p := range r.Players {
		if p.ID == id {
			p.Connected = false
			return
		}
	}
}

// KickPlayer removes the player entirely from the room (Players + PlayerOrder).
func (r *Room) KickPlayer(id string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	found := false
	filtered := r.Players[:0]
	for _, p := range r.Players {
		if p.ID == id {
			found = true
		} else {
			filtered = append(filtered, p)
		}
	}
	if !found {
		return false
	}
	r.Players = filtered
	order := r.PlayerOrder[:0]
	for _, oid := range r.PlayerOrder {
		if oid != id {
			order = append(order, oid)
		}
	}
	r.PlayerOrder = order
	return true
}

func (r *Room) GetPlayer(id string) *Player {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.getPlayerUnlocked(id)
}

func (r *Room) getPlayerUnlocked(id string) *Player {
	for _, p := range r.Players {
		if p.ID == id {
			return p
		}
	}
	return nil
}

func (r *Room) ActivePlayer() *Player {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.activePlayerUnlocked()
}

func (r *Room) activePlayerUnlocked() *Player {
	if len(r.PlayerOrder) == 0 {
		return nil
	}
	idx := r.ActivePlayerIndex % len(r.PlayerOrder)
	return r.getPlayerUnlocked(r.PlayerOrder[idx])
}

func (r *Room) NextActivePlayer() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.PlayerOrder) > 0 {
		r.ActivePlayerIndex = (r.ActivePlayerIndex + 1) % len(r.PlayerOrder)
	}
}

func (r *Room) ShufflePlayers() {
	r.mu.Lock()
	defer r.mu.Unlock()
	rand.Shuffle(len(r.PlayerOrder), func(i, j int) {
		r.PlayerOrder[i], r.PlayerOrder[j] = r.PlayerOrder[j], r.PlayerOrder[i]
	})
}

func (r *Room) SetPlayerOrder(ids []string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.PlayerOrder = ids
}

func (r *Room) ConnectedPlayerCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	count := 0
	for _, p := range r.Players {
		if p.Connected {
			count++
		}
	}
	return count
}

// ConnectedPlayerIDs returns the IDs of all currently connected players.
func (r *Room) ConnectedPlayerIDs() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ids := make([]string, 0, len(r.Players))
	for _, p := range r.Players {
		if p.Connected {
			ids = append(ids, p.ID)
		}
	}
	return ids
}

// AdjustScore sets a player's score directly.
func (r *Room) AdjustScore(playerID string, newScore int) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, p := range r.Players {
		if p.ID == playerID {
			p.Score = newScore
			return true
		}
	}
	return false
}

// ApplyResult applies the point delta and returns (delta, newScore).
func (r *Room) ApplyResult(playerID string, correct bool, points int) (int, int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delta := 0
	if correct {
		delta = points
	} else {
		delta = -(points / 2)
	}
	for _, p := range r.Players {
		if p.ID == playerID {
			p.Score += delta
			return delta, p.Score
		}
	}
	return 0, 0
}

// Snapshot returns a serialisable copy of the room state.
// Game-specific fields (board, currentPhase) are populated from Game.Snapshot()
// so that the GAME_STATE message keeps its existing shape without breaking the frontend.
//
// r.mu is released before calling game.Snapshot() to avoid a lock-order deadlock:
// HandleAdminCommand holds j.mu → acquires r.mu (ApplyResult), while
// Room.Snapshot holding r.mu → would try to acquire j.mu (Game.Snapshot).
func (r *Room) Snapshot() RoomSnapshot {
	r.mu.RLock()

	scores := make([]Player, 0, len(r.Players))
	for _, p := range r.Players {
		scores = append(scores, *p)
	}

	order := make([]string, len(r.PlayerOrder))
	copy(order, r.PlayerOrder)

	activePlayerID := ""
	if len(r.PlayerOrder) > 0 {
		activePlayerID = r.PlayerOrder[r.ActivePlayerIndex%len(r.PlayerOrder)]
	}

	snap := RoomSnapshot{
		Code:           r.Code,
		Scores:         scores,
		PlayerOrder:    order,
		GameType:       string(r.GameType),
		RoomPhase:      string(r.Phase),
		ActivePlayerID: activePlayerID,
	}
	game := r.Game
	r.mu.RUnlock() // release before calling game.Snapshot() — prevents lock-order inversion

	// Merge game-specific state for backward-compatible GAME_STATE payloads.
	if game != nil {
		gs := game.Snapshot()
		snap.GameState = gs
		if cats, ok := gs["board"].([]Category); ok {
			snap.Categories = cats
		}
		if phase, ok := gs["current_phase"].(string); ok {
			snap.CurrentPhase = phase
		}
	}

	return snap
}

const codeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func generateCode() string {
	b := make([]byte, 6)
	for i := range b {
		b[i] = codeChars[rand.Intn(len(codeChars))]
	}
	return string(b)
}
