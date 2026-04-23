package ws

import (
	"context"
	"log"
	"net/http"
	"strings"

	"jeopardy/game"

	"github.com/google/uuid"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

type Handler struct {
	hub     *Hub
	manager *game.Manager
}

func NewHandler(hub *Hub, manager *game.Manager) *Handler {
	return &Handler{hub: hub, manager: manager}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	isAdmin := r.URL.Query().Get("role") == "admin"

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("websocket accept error: %v", err)
		return
	}

	clientID := uuid.NewString()
	c := &Client{
		ID:      clientID,
		IsAdmin: isAdmin,
		conn:    conn,
		send:    make(chan OutgoingMessage, 64),
		hub:     h.hub,
	}

	h.hub.Register(c)
	defer func() {
		h.hub.Unregister(c)
		if c.PlayerID != "" && c.RoomCode != "" {
			// Use the room the player actually joined — not the current room,
			// which may have been replaced by a new admin session.
			room := h.manager.GetRoomByCode(c.RoomCode)
			if room != nil {
				room.RemovePlayer(c.PlayerID)
				h.hub.SendToAdmin(OutgoingMessage{
					Type:    MsgPlayerLeft,
					Payload: PlayerLeftPayload{PlayerID: c.PlayerID},
				})
			}
		}
	}()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	go c.writePump(ctx)

	// Send current state on connect
	room := h.manager.GetRoom()
	if room != nil {
		c.Send(buildGameState(room))
	}

	// Read loop
	for {
		var msg IncomingMessage
		if err := wsjson.Read(ctx, conn, &msg); err != nil {
			if !strings.Contains(err.Error(), "EOF") &&
				!strings.Contains(err.Error(), "close") {
				log.Printf("read error for client %s: %v", clientID, err)
			}
			return
		}
		h.route(c, msg)
	}
}

func (h *Handler) route(c *Client, msg IncomingMessage) {
	switch msg.Type {
	case MsgJoinGame:
		h.handleJoinGame(c, msg.Payload)
	case MsgBuzz:
		h.handleBuzz(c)
	default:
		log.Printf("unknown message type: %s", msg.Type)
	}
}

func (h *Handler) handleJoinGame(c *Client, payload map[string]any) {
	roomCode, _ := payload["roomCode"].(string)
	playerName, _ := payload["playerName"].(string)

	if roomCode == "" || playerName == "" {
		c.Send(OutgoingMessage{Type: MsgError, Payload: ErrorPayload{Message: "roomCode and playerName required"}})
		return
	}

	room := h.manager.GetRoomByCode(roomCode)
	if room == nil {
		c.Send(OutgoingMessage{Type: MsgError, Payload: ErrorPayload{Message: "room not found"}})
		return
	}

	player, isNew := room.AddPlayer(playerName)
	c.PlayerID = player.ID
	c.RoomCode = room.Code

	// Broadcast updated state to ALL clients so every waiting player sees the new joiner
	h.hub.Broadcast(buildGameState(room))

	if isNew {
		h.hub.SendToAdmin(OutgoingMessage{
			Type:    MsgPlayerJoined,
			Payload: PlayerJoinedPayload{PlayerID: player.ID, PlayerName: player.Name},
		})
	}
}

func (h *Handler) handleBuzz(c *Client) {
	if c.PlayerID == "" {
		return
	}
	room := h.manager.GetRoom()
	if room == nil {
		return
	}

	player, ok := room.AttemptBuzz(c.PlayerID)
	if !ok || player == nil {
		return
	}

	h.hub.Broadcast(OutgoingMessage{
		Type: MsgPlayerBuzzed,
		Payload: PlayerBuzzedPayload{
			PlayerID:   player.ID,
			PlayerName: player.Name,
		},
	})
}

// buildGameState assembles a GAME_STATE message from the current room.
func buildGameState(room *game.Room) OutgoingMessage {
	snap := room.Snapshot()
	return OutgoingMessage{
		Type:    MsgGameState,
		Payload: snap,
	}
}

// ---- Exported helpers for REST API handlers to trigger WS messages ----

// ResetPlayerClients sends ROOM_RESET to all player WS clients and clears their session.
func (h *Handler) ResetPlayerClients() {
	h.hub.ResetPlayerClients()
}

func (h *Handler) BroadcastGameState() {
	room := h.manager.GetRoom()
	if room == nil {
		return
	}
	h.hub.Broadcast(buildGameState(room))
}

func (h *Handler) BroadcastQuestionOpened(q *game.Question, categoryName string) {
	h.hub.Broadcast(OutgoingMessage{
		Type: MsgQuestionOpened,
		Payload: QuestionOpenedPayload{
			QuestionID: q.ID,
			Category:   categoryName,
			Points:     q.Points,
			Text:       q.Text,
			ImageURL:   q.ImageURL,
			AudioURL:   q.AudioURL,
			VideoURL:   q.VideoURL,
		},
	})
}

func (h *Handler) BroadcastActivePlayer(p *game.Player) {
	h.hub.Broadcast(OutgoingMessage{
		Type:    MsgActivePlayer,
		Payload: ActivePlayerPayload{PlayerID: p.ID, PlayerName: p.Name},
	})
}

func (h *Handler) BroadcastBuzzerOpen() {
	h.hub.Broadcast(OutgoingMessage{Type: MsgBuzzerOpen, Payload: map[string]any{}})
}

func (h *Handler) BroadcastAnswerResult(playerID string, correct bool, delta, newScore int) {
	h.hub.Broadcast(OutgoingMessage{
		Type: MsgAnswerResult,
		Payload: AnswerResultPayload{
			PlayerID:    playerID,
			Correct:     correct,
			PointsDelta: delta,
			NewScore:    newScore,
		},
	})
}

func (h *Handler) BroadcastBoardUpdate(questionID string) {
	h.hub.Broadcast(OutgoingMessage{
		Type:    MsgBoardUpdate,
		Payload: BoardUpdatePayload{QuestionID: questionID, Played: true},
	})
}

func (h *Handler) BroadcastGameOver(scores any) {
	h.hub.Broadcast(OutgoingMessage{
		Type:    MsgGameOver,
		Payload: GameOverPayload{FinalScores: scores},
	})
}
