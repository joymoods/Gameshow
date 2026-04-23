package game

import (
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type GamePhase string

const (
	PhaseLobby                 GamePhase = "LOBBY"
	PhaseQuestionOpen          GamePhase = "QUESTION_OPEN"
	PhaseActivePlayerAnswering GamePhase = "ACTIVE_PLAYER_ANSWERING"
	PhaseBuzzerPhase           GamePhase = "BUZZER_PHASE"
	PhaseGameOver              GamePhase = "GAME_OVER"
)

type Player struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Score     int    `json:"score"`
	Connected bool   `json:"connected"`
}

type RoomSnapshot struct {
	Code          string     `json:"roomCode"`
	Categories    []Category `json:"board"`
	Scores        []Player   `json:"scores"`
	PlayerOrder   []string   `json:"activePlayers"`
	CurrentPhase  string     `json:"currentPhase"`
}

type Room struct {
	mu sync.RWMutex

	Code              string
	Players           []*Player
	PlayerOrder       []string // Player IDs in turn order
	ActivePlayerIndex int
	Categories        []Category
	Phase             GamePhase
	CurrentQuestion   *Question
	BuzzedPlayerID    string          // first player who buzzed in buzzer phase
	BuzzedPlayers     map[string]bool // players who already buzzed this round
	CreatedAt         time.Time
}

func NewRoom() *Room {
	return &Room{
		Code:          generateCode(),
		Players:       []*Player{},
		PlayerOrder:   []string{},
		Categories:    []Category{},
		Phase:         PhaseLobby,
		BuzzedPlayers: make(map[string]bool),
		CreatedAt:     time.Now(),
	}
}

// AddPlayer adds a new player or reconnects an existing one.
// Returns (player, isNew).
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

// AttemptBuzz tries to register a buzz for playerID.
// Returns (player, ok) — ok is false if buzz is not accepted.
func (r *Room) AttemptBuzz(playerID string) (*Player, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.Phase != PhaseBuzzerPhase {
		return nil, false
	}
	if r.BuzzedPlayers[playerID] {
		return nil, false
	}
	if r.BuzzedPlayerID != "" {
		return nil, false
	}

	r.BuzzedPlayerID = playerID
	r.BuzzedPlayers[playerID] = true
	return r.getPlayerUnlocked(playerID), true
}

// OpenBuzzerPhase transitions to buzzer phase.
// excludePlayerID is the active player who just answered wrong — they are
// added to BuzzedPlayers so they cannot buzz in the same question.
func (r *Room) OpenBuzzerPhase(excludePlayerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Phase = PhaseBuzzerPhase
	r.BuzzedPlayerID = ""
	if excludePlayerID != "" {
		r.BuzzedPlayers[excludePlayerID] = true
	}
}

// ReopenBuzzerPhase re-opens the buzzer after a wrong answer in buzzer phase.
// The player who just answered wrong is already in BuzzedPlayers from AttemptBuzz.
func (r *Room) ReopenBuzzerPhase() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Phase = PhaseBuzzerPhase
	r.BuzzedPlayerID = ""
}

// HasRemainingBuzzers returns true if any connected player hasn't buzzed yet this question.
func (r *Room) HasRemainingBuzzers() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, p := range r.Players {
		if p.Connected && !r.BuzzedPlayers[p.ID] {
			return true
		}
	}
	return false
}

// ResetBuzzedPlayers clears buzz history for a new question.
func (r *Room) ResetBuzzedPlayers() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.BuzzedPlayers = make(map[string]bool)
	r.BuzzedPlayerID = ""
}

func (r *Room) SetPhase(p GamePhase) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Phase = p
}

func (r *Room) GetPhase() GamePhase {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.Phase
}

func (r *Room) AllQuestionsPlayed() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, cat := range r.Categories {
		for _, q := range cat.Questions {
			if !q.Played {
				return false
			}
		}
	}
	return true
}

func (r *Room) MarkQuestionPlayed(questionID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.Categories {
		for j := range r.Categories[i].Questions {
			if r.Categories[i].Questions[j].ID == questionID {
				r.Categories[i].Questions[j].Played = true
				return
			}
		}
	}
}

func (r *Room) GetQuestion(questionID string) *Question {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for i := range r.Categories {
		for j := range r.Categories[i].Questions {
			if r.Categories[i].Questions[j].ID == questionID {
				q := r.Categories[i].Questions[j]
				return &q
			}
		}
	}
	return nil
}

// GetCategoryName returns the category name for a given question ID.
func (r *Room) GetCategoryName(questionID string) string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, cat := range r.Categories {
		for _, q := range cat.Questions {
			if q.ID == questionID {
				return cat.Name
			}
		}
	}
	return ""
}

func (r *Room) SetCurrentQuestion(q *Question) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.CurrentQuestion = q
}

func (r *Room) GetCurrentQuestion() *Question {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.CurrentQuestion
}

// Snapshot returns a safe read-only copy of the room state.
func (r *Room) Snapshot() RoomSnapshot {
	r.mu.RLock()
	defer r.mu.RUnlock()

	scores := make([]Player, 0, len(r.Players))
	for _, p := range r.Players {
		scores = append(scores, *p)
	}

	order := make([]string, len(r.PlayerOrder))
	copy(order, r.PlayerOrder)

	cats := make([]Category, len(r.Categories))
	copy(cats, r.Categories)

	return RoomSnapshot{
		Code:         r.Code,
		Categories:   cats,
		Scores:       scores,
		PlayerOrder:  order,
		CurrentPhase: string(r.Phase),
	}
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

// SetCategories replaces the quiz content.
func (r *Room) SetCategories(cats []Category) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Categories = cats
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

const codeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func generateCode() string {
	b := make([]byte, 6)
	for i := range b {
		b[i] = codeChars[rand.Intn(len(codeChars))]
	}
	return string(b)
}
