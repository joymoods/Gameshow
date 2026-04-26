package core

import (
	"context"
	"log"
	"sync"
	"time"
)

type Manager struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

func NewManager() *Manager {
	return &Manager{
		rooms: make(map[string]*Room),
	}
}

func (m *Manager) CreateRoom() *Room {
	m.mu.Lock()
	defer m.mu.Unlock()
	room := newRoom()
	m.rooms[room.Code] = room
	return room
}

func (m *Manager) GetRoom(code string) (*Room, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	r, ok := m.rooms[code]
	return r, ok
}

func (m *Manager) ListRooms() []*Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	rooms := make([]*Room, 0, len(m.rooms))
	for _, r := range m.rooms {
		rooms = append(rooms, r)
	}
	return rooms
}

func (m *Manager) DeleteRoom(code string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.rooms, code)
}

// StartCleanup periodically removes stale rooms:
//   - GAME_OVER rooms older than 2 hours
//   - LOBBY rooms with no connected players older than 30 minutes
func (m *Manager) StartCleanup(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.cleanup()
		}
	}
}

func (m *Manager) cleanup() {
	now := time.Now()
	m.mu.Lock()
	defer m.mu.Unlock()
	for code, room := range m.rooms {
		room.mu.RLock()
		phase := room.Phase
		created := room.CreatedAt
		connected := 0
		for _, p := range room.Players {
			if p.Connected {
				connected++
			}
		}
		room.mu.RUnlock()

		switch {
		case phase == RoomPhaseGameOver && now.Sub(created) > 2*time.Hour:
			log.Printf("cleanup: removing GAME_OVER room %s", code)
			delete(m.rooms, code)
		case phase == RoomPhaseLobby && connected == 0 && now.Sub(created) > 30*time.Minute:
			log.Printf("cleanup: removing empty LOBBY room %s", code)
			delete(m.rooms, code)
		}
	}
}
