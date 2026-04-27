package core

import (
	"testing"
	"time"
)

func TestNewManager(t *testing.T) {
	m := NewManager()
	if m == nil {
		t.Fatal("expected non-nil manager")
	}
	if len(m.ListRooms()) != 0 {
		t.Error("expected empty rooms on new manager")
	}
}

func TestCreateRoom(t *testing.T) {
	m := NewManager()
	r := m.CreateRoom()

	if r == nil {
		t.Fatal("expected non-nil room")
	}
	if len(r.Code) != 6 {
		t.Errorf("expected 6-char code, got %q", r.Code)
	}
	if r.Phase != RoomPhaseLobby {
		t.Errorf("expected LOBBY phase, got %q", r.Phase)
	}
	if r.CreatedAt.IsZero() {
		t.Error("expected non-zero CreatedAt")
	}
}

func TestCreateRoom_UniqueCode(t *testing.T) {
	m := NewManager()
	codes := make(map[string]bool)
	for i := 0; i < 50; i++ {
		r := m.CreateRoom()
		if codes[r.Code] {
			t.Errorf("duplicate room code: %q", r.Code)
		}
		codes[r.Code] = true
	}
}

func TestGetRoom_Found(t *testing.T) {
	m := NewManager()
	r := m.CreateRoom()

	got, ok := m.GetRoom(r.Code)
	if !ok {
		t.Fatal("expected room to be found")
	}
	if got.Code != r.Code {
		t.Errorf("expected code %q, got %q", r.Code, got.Code)
	}
}

func TestGetRoom_NotFound(t *testing.T) {
	m := NewManager()
	_, ok := m.GetRoom("XXXXXX")
	if ok {
		t.Error("expected room to not be found")
	}
}

func TestListRooms(t *testing.T) {
	m := NewManager()

	if len(m.ListRooms()) != 0 {
		t.Error("expected empty list initially")
	}

	m.CreateRoom()
	m.CreateRoom()
	m.CreateRoom()

	if len(m.ListRooms()) != 3 {
		t.Errorf("expected 3 rooms, got %d", len(m.ListRooms()))
	}
}

func TestDeleteRoom(t *testing.T) {
	m := NewManager()
	r := m.CreateRoom()

	m.DeleteRoom(r.Code)

	_, ok := m.GetRoom(r.Code)
	if ok {
		t.Error("expected room to be deleted")
	}
	if len(m.ListRooms()) != 0 {
		t.Error("expected empty room list after delete")
	}
}

func TestDeleteRoom_NonExistent(t *testing.T) {
	m := NewManager()
	m.DeleteRoom("XXXXXX") // must not panic
}

func TestCleanup_GameOverOld(t *testing.T) {
	m := NewManager()
	r := m.CreateRoom()
	r.Phase = RoomPhaseGameOver
	r.CreatedAt = time.Now().Add(-3 * time.Hour)

	m.cleanup()

	_, ok := m.GetRoom(r.Code)
	if ok {
		t.Error("expected old GAME_OVER room to be cleaned up")
	}
}

func TestCleanup_GameOverRecent_Kept(t *testing.T) {
	m := NewManager()
	r := m.CreateRoom()
	r.Phase = RoomPhaseGameOver
	r.CreatedAt = time.Now().Add(-30 * time.Minute)

	m.cleanup()

	_, ok := m.GetRoom(r.Code)
	if !ok {
		t.Error("expected recent GAME_OVER room to survive cleanup")
	}
}

func TestCleanup_EmptyLobbyOld(t *testing.T) {
	m := NewManager()
	r := m.CreateRoom()
	r.CreatedAt = time.Now().Add(-31 * time.Minute)
	// no connected players

	m.cleanup()

	_, ok := m.GetRoom(r.Code)
	if ok {
		t.Error("expected old empty LOBBY room to be cleaned up")
	}
}

func TestCleanup_LobbyWithPlayer_Kept(t *testing.T) {
	m := NewManager()
	r := m.CreateRoom()
	r.CreatedAt = time.Now().Add(-31 * time.Minute)
	r.AddPlayer("Alice") // connected player

	m.cleanup()

	_, ok := m.GetRoom(r.Code)
	if !ok {
		t.Error("expected LOBBY with connected player to survive cleanup")
	}
}

func TestCleanup_InProgressOld_Kept(t *testing.T) {
	m := NewManager()
	r := m.CreateRoom()
	r.Phase = RoomPhaseInProgress
	r.CreatedAt = time.Now().Add(-5 * time.Hour)

	m.cleanup()

	_, ok := m.GetRoom(r.Code)
	if !ok {
		t.Error("expected IN_PROGRESS room to survive cleanup regardless of age")
	}
}
