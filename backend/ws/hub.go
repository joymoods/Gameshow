package ws

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

// Client represents a connected WebSocket client.
type Client struct {
	ID       string
	PlayerID string
	RoomCode string // room the player joined — stays valid even after room replacement
	IsAdmin  bool
	conn     *websocket.Conn
	send     chan OutgoingMessage
	hub      *Hub
}

// Hub manages all connected clients and broadcasting.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client // keyed by Client.ID
	admin   *Client
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[string]*Client),
	}
}

func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c.ID] = c
	if c.IsAdmin {
		h.admin = c
	}
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, c.ID)
	if c.IsAdmin && h.admin == c {
		h.admin = nil
	}
}

// Broadcast sends a message to all connected clients.
func (h *Hub) Broadcast(msg OutgoingMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		select {
		case c.send <- msg:
		default:
			log.Printf("send buffer full for client %s, dropping message", c.ID)
		}
	}
}

// SendToAdmin sends a message only to the admin client.
func (h *Hub) SendToAdmin(msg OutgoingMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if h.admin != nil {
		select {
		case h.admin.send <- msg:
		default:
			log.Printf("send buffer full for admin, dropping message")
		}
	}
}

// ResetPlayerClients clears PlayerID/RoomCode on all non-admin clients and
// sends them a ROOM_RESET so they know to return to the join screen.
func (h *Hub) ResetPlayerClients() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, c := range h.clients {
		if c.IsAdmin {
			continue
		}
		c.PlayerID = ""
		c.RoomCode = ""
		select {
		case c.send <- OutgoingMessage{Type: MsgRoomReset, Payload: map[string]any{}}:
		default:
		}
	}
}

// ResetRoomPlayers clears PlayerID/RoomCode on non-admin clients in a specific room
// and sends them a ROOM_RESET.
func (h *Hub) ResetRoomPlayers(roomCode string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, c := range h.clients {
		if c.IsAdmin || c.RoomCode != roomCode {
			continue
		}
		c.PlayerID = ""
		c.RoomCode = ""
		select {
		case c.send <- OutgoingMessage{Type: MsgRoomReset, Payload: map[string]any{}}:
		default:
		}
	}
}

// KickPlayerClient sends a KICKED message to the player and closes their connection.
func (h *Hub) KickPlayerClient(roomCode, playerID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, c := range h.clients {
		if c.IsAdmin || c.RoomCode != roomCode || c.PlayerID != playerID {
			continue
		}
		select {
		case c.send <- OutgoingMessage{Type: "KICKED", Payload: map[string]any{}}:
		default:
		}
	}
}

// BroadcastToPlayers sends a message to all non-admin clients.
func (h *Hub) BroadcastToPlayers(msg OutgoingMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		if c.IsAdmin {
			continue
		}
		select {
		case c.send <- msg:
		default:
			log.Printf("send buffer full for client %s, dropping message", c.ID)
		}
	}
}

// SendToClient sends a message to a specific client by player ID.
func (h *Hub) SendToClient(playerID string, msg OutgoingMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		if c.PlayerID == playerID {
			select {
			case c.send <- msg:
			default:
			}
			return
		}
	}
}

// writePump sends queued messages to the WebSocket connection.
// A 30s ticker sends application-level PINGs to keep the connection alive
// through proxies (e.g. Cloudflare Tunnel) that drop idle WebSocket connections.
func (c *Client) writePump(ctx context.Context) {
	defer c.conn.Close(websocket.StatusNormalClosure, "")
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			if err := wsjson.Write(ctx, c.conn, msg); err != nil {
				log.Printf("write error for client %s: %v", c.ID, err)
				return
			}
		case <-ticker.C:
			ping := OutgoingMessage{Type: MsgPing, Payload: map[string]any{}}
			if err := wsjson.Write(ctx, c.conn, ping); err != nil {
				log.Printf("keepalive ping error for client %s: %v", c.ID, err)
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

// Send enqueues a message for this client.
func (c *Client) Send(msg OutgoingMessage) {
	select {
	case c.send <- msg:
	default:
		log.Printf("send buffer full for client %s", c.ID)
	}
}

// SendJSON is a convenience helper for sending directly (used in handler).
func SendJSON(ctx context.Context, conn *websocket.Conn, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return conn.Write(ctx, websocket.MessageText, data)
}
