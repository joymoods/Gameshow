package core

import (
	"testing"
)

func TestAddPlayer_New(t *testing.T) {
	r := newRoom()

	p, isNew, _ := r.AddPlayer("Alice")

	if !isNew {
		t.Error("expected isNew=true for first player")
	}
	if p.Name != "Alice" {
		t.Errorf("expected name Alice, got %q", p.Name)
	}
	if !p.Connected {
		t.Error("expected player to be connected")
	}
	if p.ID == "" {
		t.Error("expected non-empty player ID")
	}
	if p.Score != 0 {
		t.Errorf("expected score=0, got %d", p.Score)
	}
}

func TestAddPlayer_AppendedToOrder(t *testing.T) {
	r := newRoom()
	p, _, _ := r.AddPlayer("Alice")

	if len(r.PlayerOrder) != 1 || r.PlayerOrder[0] != p.ID {
		t.Error("expected player ID in PlayerOrder after add")
	}
}

func TestAddPlayer_Reconnect_CaseInsensitive(t *testing.T) {
	r := newRoom()
	p1, _, _ := r.AddPlayer("Alice")
	p1.Connected = false

	p2, isNew, _ := r.AddPlayer("alice")

	if isNew {
		t.Error("expected isNew=false for reconnect")
	}
	if p2.ID != p1.ID {
		t.Error("expected same player ID on reconnect")
	}
	if !p2.Connected {
		t.Error("expected player to be marked connected after reconnect")
	}
	if len(r.Players) != 1 {
		t.Errorf("expected 1 player, got %d", len(r.Players))
	}
}

func TestAddPlayer_Reconnect_DoesNotDuplicateOrder(t *testing.T) {
	r := newRoom()
	p, _, _ := r.AddPlayer("Alice")
	p.Connected = false
	r.AddPlayer("Alice")

	if len(r.PlayerOrder) != 1 {
		t.Errorf("expected 1 entry in PlayerOrder, got %d", len(r.PlayerOrder))
	}
}

func TestRemovePlayer_SetsDisconnected(t *testing.T) {
	r := newRoom()
	p, _, _ := r.AddPlayer("Alice")

	r.RemovePlayer(p.ID)

	got := r.GetPlayer(p.ID)
	if got == nil {
		t.Fatal("expected player to still exist after remove")
	}
	if got.Connected {
		t.Error("expected player to be disconnected after remove")
	}
}

func TestRemovePlayer_NonExistent(t *testing.T) {
	r := newRoom()
	r.RemovePlayer("nonexistent-id") // must not panic
}

func TestGetPlayer_Found(t *testing.T) {
	r := newRoom()
	p, _, _ := r.AddPlayer("Alice")

	got := r.GetPlayer(p.ID)
	if got == nil || got.ID != p.ID {
		t.Error("expected to find player by ID")
	}
}

func TestGetPlayer_NotFound(t *testing.T) {
	r := newRoom()

	got := r.GetPlayer("unknown")
	if got != nil {
		t.Error("expected nil for unknown player ID")
	}
}

func TestActivePlayer_Single(t *testing.T) {
	r := newRoom()
	p, _, _ := r.AddPlayer("Alice")

	active := r.ActivePlayer()
	if active == nil {
		t.Fatal("expected active player")
	}
	if active.ID != p.ID {
		t.Errorf("expected Alice, got %q", active.Name)
	}
}

func TestActivePlayer_Empty(t *testing.T) {
	r := newRoom()
	if r.ActivePlayer() != nil {
		t.Error("expected nil active player with no players")
	}
}

func TestNextActivePlayer_Rotates(t *testing.T) {
	r := newRoom()
	p1, _, _ := r.AddPlayer("Alice")
	p2, _, _ := r.AddPlayer("Bob")
	p3, _, _ := r.AddPlayer("Charlie")

	if r.ActivePlayer().ID != p1.ID {
		t.Error("expected Alice first")
	}

	r.NextActivePlayer()
	if r.ActivePlayer().ID != p2.ID {
		t.Error("expected Bob second")
	}

	r.NextActivePlayer()
	if r.ActivePlayer().ID != p3.ID {
		t.Error("expected Charlie third")
	}

	r.NextActivePlayer()
	if r.ActivePlayer().ID != p1.ID {
		t.Error("expected Alice again after wrap")
	}
}

func TestApplyResult_Correct(t *testing.T) {
	r := newRoom()
	p, _, _ := r.AddPlayer("Alice")

	delta, newScore := r.ApplyResult(p.ID, true, 100)

	if delta != 100 {
		t.Errorf("expected delta=100, got %d", delta)
	}
	if newScore != 100 {
		t.Errorf("expected newScore=100, got %d", newScore)
	}
	if r.GetPlayer(p.ID).Score != 100 {
		t.Errorf("expected player score=100, got %d", r.GetPlayer(p.ID).Score)
	}
}

func TestApplyResult_Incorrect(t *testing.T) {
	r := newRoom()
	p, _, _ := r.AddPlayer("Alice")

	delta, newScore := r.ApplyResult(p.ID, false, 100)

	if delta != -50 {
		t.Errorf("expected delta=-50, got %d", delta)
	}
	if newScore != -50 {
		t.Errorf("expected newScore=-50, got %d", newScore)
	}
}

func TestApplyResult_NegativeScore(t *testing.T) {
	r := newRoom()
	p, _, _ := r.AddPlayer("Alice")

	r.ApplyResult(p.ID, false, 200)
	_, newScore := r.ApplyResult(p.ID, false, 200)

	if newScore != -200 {
		t.Errorf("expected newScore=-200, got %d", newScore)
	}
}

func TestApplyResult_Accumulates(t *testing.T) {
	r := newRoom()
	p, _, _ := r.AddPlayer("Alice")

	r.ApplyResult(p.ID, true, 200)
	r.ApplyResult(p.ID, true, 100)
	_, finalScore := r.ApplyResult(p.ID, false, 300)

	// 200 + 100 - 150 = 150
	if finalScore != 150 {
		t.Errorf("expected finalScore=150, got %d", finalScore)
	}
}

func TestApplyResult_UnknownPlayer(t *testing.T) {
	r := newRoom()
	delta, newScore := r.ApplyResult("unknown-id", true, 100)

	if delta != 0 || newScore != 0 {
		t.Errorf("expected (0, 0) for unknown player, got (%d, %d)", delta, newScore)
	}
}

func TestAdjustScore(t *testing.T) {
	r := newRoom()
	p, _, _ := r.AddPlayer("Alice")

	ok := r.AdjustScore(p.ID, 999)
	if !ok {
		t.Error("expected AdjustScore to return true")
	}
	if r.GetPlayer(p.ID).Score != 999 {
		t.Errorf("expected score=999, got %d", r.GetPlayer(p.ID).Score)
	}
}

func TestAdjustScore_Negative(t *testing.T) {
	r := newRoom()
	p, _, _ := r.AddPlayer("Alice")

	r.AdjustScore(p.ID, -500)
	if r.GetPlayer(p.ID).Score != -500 {
		t.Errorf("expected score=-500, got %d", r.GetPlayer(p.ID).Score)
	}
}

func TestAdjustScore_NotFound(t *testing.T) {
	r := newRoom()
	ok := r.AdjustScore("unknown-id", 100)
	if ok {
		t.Error("expected AdjustScore to return false for unknown player")
	}
}

func TestConnectedPlayerCount(t *testing.T) {
	r := newRoom()
	r.AddPlayer("Alice")
	p2, _, _ := r.AddPlayer("Bob")
	r.RemovePlayer(p2.ID)

	if r.ConnectedPlayerCount() != 1 {
		t.Errorf("expected 1 connected player, got %d", r.ConnectedPlayerCount())
	}
}

func TestConnectedPlayerCount_Zero(t *testing.T) {
	r := newRoom()
	if r.ConnectedPlayerCount() != 0 {
		t.Error("expected 0 connected players on empty room")
	}
}

func TestConnectedPlayerIDs(t *testing.T) {
	r := newRoom()
	p1, _, _ := r.AddPlayer("Alice")
	p2, _, _ := r.AddPlayer("Bob")
	r.RemovePlayer(p2.ID)

	ids := r.ConnectedPlayerIDs()
	if len(ids) != 1 || ids[0] != p1.ID {
		t.Errorf("expected only Alice's ID, got %v", ids)
	}
}

func TestSetPlayerOrder(t *testing.T) {
	r := newRoom()
	p1, _, _ := r.AddPlayer("Alice")
	p2, _, _ := r.AddPlayer("Bob")

	r.SetPlayerOrder([]string{p2.ID, p1.ID})

	if r.ActivePlayer().ID != p2.ID {
		t.Error("expected Bob first after SetPlayerOrder")
	}
}

func TestShufflePlayers(t *testing.T) {
	r := newRoom()
	for _, name := range []string{"Alice", "Bob", "Charlie", "Dave", "Eve"} {
		r.AddPlayer(name)
	}
	original := make([]string, len(r.PlayerOrder))
	copy(original, r.PlayerOrder)

	// Shuffling must not panic and must preserve the same IDs
	r.ShufflePlayers()

	if len(r.PlayerOrder) != len(original) {
		t.Error("shuffle changed number of players")
	}
	seen := make(map[string]bool)
	for _, id := range r.PlayerOrder {
		seen[id] = true
	}
	for _, id := range original {
		if !seen[id] {
			t.Errorf("player %q lost after shuffle", id)
		}
	}
}

func TestGetPhase_SetPhase(t *testing.T) {
	r := newRoom()

	if r.GetPhase() != RoomPhaseLobby {
		t.Errorf("expected LOBBY, got %q", r.GetPhase())
	}

	r.SetPhase(RoomPhaseInProgress)
	if r.GetPhase() != RoomPhaseInProgress {
		t.Errorf("expected IN_PROGRESS, got %q", r.GetPhase())
	}
}

func TestSnapshot_Basic(t *testing.T) {
	r := newRoom()
	r.AddPlayer("Alice")

	snap := r.Snapshot()

	if snap.Code != r.Code {
		t.Errorf("expected code %q, got %q", r.Code, snap.Code)
	}
	if snap.RoomPhase != string(RoomPhaseLobby) {
		t.Errorf("expected LOBBY, got %q", snap.RoomPhase)
	}
	if len(snap.Scores) != 1 {
		t.Errorf("expected 1 player in scores, got %d", len(snap.Scores))
	}
	if len(snap.PlayerOrder) != 1 {
		t.Errorf("expected 1 player in order, got %d", len(snap.PlayerOrder))
	}
}

func TestSnapshot_ActivePlayerID(t *testing.T) {
	r := newRoom()
	p, _, _ := r.AddPlayer("Alice")

	snap := r.Snapshot()
	if snap.ActivePlayerID != p.ID {
		t.Errorf("expected ActivePlayerID=%q, got %q", p.ID, snap.ActivePlayerID)
	}
}

func TestGenerateCode_ValidChars(t *testing.T) {
	for i := 0; i < 100; i++ {
		code := generateCode()
		if len(code) != 6 {
			t.Errorf("expected 6-char code, got %q", code)
		}
		for _, c := range code {
			if !isValidCodeChar(c) {
				t.Errorf("unexpected char %q in code %q", c, code)
			}
		}
	}
}

func isValidCodeChar(c rune) bool {
	return (c >= 'A' && c <= 'Z' || c >= '2' && c <= '9') &&
		c != 'I' && c != 'O' && c != '0' && c != '1' // ambiguous chars excluded
}
