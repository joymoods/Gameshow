package ws

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"games/game/core"
	"games/game/jeopardy"

	"github.com/google/uuid"
	"nhooyr.io/websocket"
)

type Handler struct {
	hub     *Hub
	manager *core.Manager
}

func NewHandler(hub *Hub, manager *core.Manager) *Handler {
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
			room, ok := h.manager.GetRoom(c.RoomCode)
			if ok {
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

	// Read loop — use raw conn.Read so we control parse errors without the
	// library closing the connection on bad JSON.
	for {
		_, raw, err := conn.Read(ctx)
		if err != nil {
			errStr := err.Error()
			if !strings.Contains(errStr, "EOF") && !strings.Contains(errStr, "close") {
				log.Printf("read error for client %s: %v", clientID, err)
			}
			return
		}
		var msg IncomingMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			log.Printf("invalid JSON from client %s: %v", clientID, err)
			c.Send(OutgoingMessage{Type: MsgError, Payload: ErrorPayload{
				Message: `invalid JSON, expected: {"type":"...","payload":{...}}`,
			}})
			continue
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
	case MsgPing:
		c.Send(OutgoingMessage{Type: MsgPong, Payload: msg.Payload})
	default:
		log.Printf("unknown message type: %s", msg.Type)
		c.Send(OutgoingMessage{Type: MsgError, Payload: ErrorPayload{
			Message: "unknown message type: " + msg.Type,
		}})
	}
}

func (h *Handler) handleJoinGame(c *Client, payload map[string]any) {
	roomCode, _ := payload["roomCode"].(string)
	playerName, _ := payload["playerName"].(string)

	if roomCode == "" || playerName == "" {
		c.Send(OutgoingMessage{Type: MsgError, Payload: ErrorPayload{Message: "roomCode and playerName required"}})
		return
	}

	room, ok := h.manager.GetRoom(roomCode)
	if !ok {
		c.Send(OutgoingMessage{Type: MsgError, Payload: ErrorPayload{Message: "room not found"}})
		return
	}

	player, isNew := room.AddPlayer(playerName)
	c.PlayerID = player.ID
	c.RoomCode = room.Code

	h.hub.Broadcast(buildGameState(room))

	if isNew {
		h.hub.SendToAdmin(OutgoingMessage{
			Type:    MsgPlayerJoined,
			Payload: PlayerJoinedPayload{PlayerID: player.ID, PlayerName: player.Name},
		})
	}
}

// handleBuzz delegates the buzz attempt to the game via HandlePlayerMessage.
// If the game accepts the buzz (nil error), the handler broadcasts PLAYER_BUZZED
// using the player info it already has from the client connection.
func (h *Handler) handleBuzz(c *Client) {
	if c.PlayerID == "" || c.RoomCode == "" {
		return
	}
	room, ok := h.manager.GetRoom(c.RoomCode)
	if !ok {
		return
	}
	if room.Game == nil {
		return
	}

	if err := room.Game.HandlePlayerMessage(c.PlayerID, "BUZZ", map[string]any{}); err != nil {
		return // buzz rejected (wrong phase, already buzzed, etc.)
	}

	// Buzz accepted — look up the player for the broadcast payload.
	player := room.GetPlayer(c.PlayerID)
	if player == nil {
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
// Room.Snapshot() already merges game-specific state (board, currentPhase) from Game.Snapshot().
func buildGameState(room *core.Room) OutgoingMessage {
	snap := room.Snapshot()
	return OutgoingMessage{
		Type:    MsgGameState,
		Payload: snap,
	}
}

// ---- Exported helpers for REST API handlers to trigger WS messages ----

func (h *Handler) ResetPlayerClients() {
	h.hub.ResetPlayerClients()
}

func (h *Handler) ResetRoomPlayers(roomCode string) {
	h.hub.ResetRoomPlayers(roomCode)
}

func (h *Handler) BroadcastGameState(room *core.Room) {
	h.hub.Broadcast(buildGameState(room))
}

func (h *Handler) BroadcastQuestionOpened(q *core.Question, categoryName string) {
	// Admin receives the full payload including the answer.
	h.hub.SendToAdmin(OutgoingMessage{
		Type: MsgQuestionOpened,
		Payload: jeopardy.QuestionOpenedPayload{
			QuestionID: q.ID,
			Category:   categoryName,
			Points:     q.Points,
			Text:       q.Text,
			Answer:     q.Answer,
			ImageURL:   q.ImageURL,
			AudioURL:   q.AudioURL,
			VideoURL:   q.VideoURL,
		},
	})
	// Players receive the same payload without the answer.
	h.hub.BroadcastToPlayers(OutgoingMessage{
		Type: MsgQuestionOpened,
		Payload: jeopardy.QuestionOpenedPayload{
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

func (h *Handler) BroadcastActivePlayer(p *core.Player) {
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
		Payload: jeopardy.AnswerResultPayload{
			PlayerID:    playerID,
			Correct:     correct,
			PointsDelta: delta,
			NewScore:    newScore,
		},
	})
}

func (h *Handler) BroadcastAnswerRevealed(answer string) {
	h.hub.Broadcast(OutgoingMessage{
		Type:    MsgAnswerRevealed,
		Payload: jeopardy.AnswerRevealedPayload{Answer: answer},
	})
}

func (h *Handler) BroadcastBoardUpdate(questionID string) {
	h.hub.Broadcast(OutgoingMessage{
		Type:    MsgBoardUpdate,
		Payload: jeopardy.BoardUpdatePayload{QuestionID: questionID, Played: true},
	})
}

func (h *Handler) BroadcastGameOver(scores any) {
	h.hub.Broadcast(OutgoingMessage{
		Type:    MsgGameOver,
		Payload: GameOverPayload{FinalScores: scores},
	})
}

func (h *Handler) BroadcastGameSwitched(gameType string) {
	h.hub.Broadcast(OutgoingMessage{
		Type:    MsgGameSwitched,
		Payload: GameSwitchedPayload{GameType: gameType},
	})
}
