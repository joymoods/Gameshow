package game

import "sync"

// Manager holds the single room (MVP: one room per server).
type Manager struct {
	mu   sync.RWMutex
	room *Room
}

func NewManager() *Manager {
	return &Manager{}
}

func (m *Manager) CreateRoom() *Room {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.room = NewRoom()
	return m.room
}

func (m *Manager) GetRoom() *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.room
}

func (m *Manager) GetRoomByCode(code string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.room != nil && m.room.Code == code {
		return m.room
	}
	return nil
}
