package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"games/api"
	"games/game/core"
	"games/ws"
)

// ---- test infrastructure ----

func newTestServer(t *testing.T) (*httptest.Server, *core.Manager) {
	t.Helper()
	manager := core.NewManager()
	hub := ws.NewHub()
	wsHandler := ws.NewHandler(hub, manager)
	router := api.NewRouter(manager, wsHandler, nil)
	mux := http.NewServeMux()
	router.Register(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, manager
}

func jsonBody(t *testing.T, v any) *bytes.Reader {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	return bytes.NewReader(b)
}

func doPost(t *testing.T, url string, body any) *http.Response {
	t.Helper()
	var r *bytes.Reader
	if body != nil {
		r = jsonBody(t, body)
	} else {
		r = bytes.NewReader(nil)
	}
	resp, err := http.Post(url, "application/json", r)
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	return resp
}

func doDelete(t *testing.T, url string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodDelete, url, nil)
	if err != nil {
		t.Fatalf("NewRequest DELETE: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("DELETE %s: %v", url, err)
	}
	return resp
}

func decode(t *testing.T, resp *http.Response, v any) {
	t.Helper()
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}

// createRoom creates a jeopardy room via the API and returns its code.
func createRoom(t *testing.T, srv *httptest.Server) string {
	t.Helper()
	resp := doPost(t, srv.URL+"/api/rooms", map[string]string{"game_type": "jeopardy"})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	var result map[string]string
	decode(t, resp, &result)
	return result["code"]
}

func testCategories() []core.Category {
	return []core.Category{
		{
			ID:   "cat-1",
			Name: "Geographie",
			Questions: []core.Question{
				{ID: "q-1", Points: 100, Text: "Hauptstadt?", Answer: "Berlin"},
				{ID: "q-2", Points: 200, Text: "Fluss?", Answer: "Nil"},
			},
		},
	}
}

// ---- GET /api/rooms ----

func TestGetRooms_Empty(t *testing.T) {
	srv, _ := newTestServer(t)

	resp, err := http.Get(srv.URL + "/api/rooms")
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var rooms []any
	decode(t, resp, &rooms)
	if len(rooms) != 0 {
		t.Errorf("expected empty list, got %d rooms", len(rooms))
	}
}

func TestGetRooms_ListsRooms(t *testing.T) {
	srv, _ := newTestServer(t)
	createRoom(t, srv)
	createRoom(t, srv)

	resp, _ := http.Get(srv.URL + "/api/rooms")
	var rooms []any
	decode(t, resp, &rooms)
	if len(rooms) != 2 {
		t.Errorf("expected 2 rooms, got %d", len(rooms))
	}
}

// ---- POST /api/rooms ----

func TestCreateRoom_Valid(t *testing.T) {
	srv, _ := newTestServer(t)

	code := createRoom(t, srv)
	if len(code) != 6 {
		t.Errorf("expected 6-char code, got %q", code)
	}
}

func TestCreateRoom_MissingGameType(t *testing.T) {
	srv, _ := newTestServer(t)

	resp := doPost(t, srv.URL+"/api/rooms", map[string]string{})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for missing game_type, got %d", resp.StatusCode)
	}
}

func TestCreateRoom_UnsupportedGameType(t *testing.T) {
	srv, _ := newTestServer(t)

	resp := doPost(t, srv.URL+"/api/rooms", map[string]string{"game_type": "chess"})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for unsupported game_type, got %d", resp.StatusCode)
	}
}

func TestCreateRoom_InvalidJSON(t *testing.T) {
	srv, _ := newTestServer(t)

	resp, _ := http.Post(srv.URL+"/api/rooms", "application/json",
		bytes.NewReader([]byte("not-json")))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid JSON, got %d", resp.StatusCode)
	}
}

// ---- GET /api/rooms/:code ----

func TestGetRoom_Found(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	resp, _ := http.Get(srv.URL + "/api/rooms/" + code)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var snap map[string]any
	decode(t, resp, &snap)
	if snap["roomCode"] != code {
		t.Errorf("expected roomCode=%q, got %v", code, snap["roomCode"])
	}
	if snap["room_phase"] != "LOBBY" {
		t.Errorf("expected room_phase=LOBBY, got %v", snap["room_phase"])
	}
}

func TestGetRoom_NotFound(t *testing.T) {
	srv, _ := newTestServer(t)

	resp, _ := http.Get(srv.URL + "/api/rooms/XXXXXX")
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// ---- DELETE /api/rooms/:code ----

func TestDeleteRoom(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	resp := doDelete(t, srv.URL+"/api/rooms/"+code)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	resp2, _ := http.Get(srv.URL + "/api/rooms/" + code)
	if resp2.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 after delete, got %d", resp2.StatusCode)
	}
}

func TestDeleteRoom_NotFound(t *testing.T) {
	srv, _ := newTestServer(t)

	resp := doDelete(t, srv.URL+"/api/rooms/XXXXXX")
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 for unknown room, got %d", resp.StatusCode)
	}
}

// ---- POST /api/rooms/:code/quiz ----

func TestUploadQuiz_Valid(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", testCategories())
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestUploadQuiz_InvalidJSON(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	resp, _ := http.Post(srv.URL+"/api/rooms/"+code+"/quiz", "application/json",
		bytes.NewReader([]byte("not-json")))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

// ---- GET /api/rooms/:code/export ----

func TestExportQuiz(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)
	doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", testCategories())

	resp, _ := http.Get(srv.URL + "/api/rooms/" + code + "/export")
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var cats []map[string]any
	decode(t, resp, &cats)
	if len(cats) != 1 {
		t.Errorf("expected 1 category, got %d", len(cats))
	}
	if cats[0]["name"] != "Geographie" {
		t.Errorf("expected name=Geographie, got %v", cats[0]["name"])
	}
}

func TestExportQuiz_Empty(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	resp, _ := http.Get(srv.URL + "/api/rooms/" + code + "/export")
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

// ---- POST /api/rooms/:code/start ----

func TestStartGame_NoPlayers(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/start", nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 (no players), got %d", resp.StatusCode)
	}
}

func TestStartGame_WithPlayer(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	room.AddPlayer("Alice")
	doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", testCategories())

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/start", nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	var result map[string]string
	decode(t, resp, &result)
	if result["status"] != "started" {
		t.Errorf("expected status=started, got %q", result["status"])
	}
	if room.GetPhase() != core.RoomPhaseInProgress {
		t.Errorf("expected IN_PROGRESS, got %q", room.GetPhase())
	}
}

// ---- POST /api/rooms/:code/end ----

func TestEndGame(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	room.AddPlayer("Alice")
	doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", testCategories())
	doPost(t, srv.URL+"/api/rooms/"+code+"/start", nil)

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/end", nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	if room.GetPhase() != core.RoomPhaseGameOver {
		t.Errorf("expected GAME_OVER, got %q", room.GetPhase())
	}
}

// ---- POST /api/rooms/:code/question/:id/open ----

func TestOpenQuestion(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	room.AddPlayer("Alice")
	doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", testCategories())
	doPost(t, srv.URL+"/api/rooms/"+code+"/start", nil)

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/question/q-1/open", nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestOpenQuestion_NotFound(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	room.AddPlayer("Alice")
	doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", testCategories())
	doPost(t, srv.URL+"/api/rooms/"+code+"/start", nil)

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/question/nonexistent/open", nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

// ---- POST /api/rooms/:code/answer ----

func TestAnswer_Correct(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	alice, _ := room.AddPlayer("Alice")
	doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", testCategories())
	doPost(t, srv.URL+"/api/rooms/"+code+"/start", nil)
	doPost(t, srv.URL+"/api/rooms/"+code+"/question/q-1/open", nil)

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/answer", map[string]any{
		"playerId": alice.ID,
		"correct":  true,
	})
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var result map[string]any
	decode(t, resp, &result)
	if result["delta"].(float64) != 100 {
		t.Errorf("expected delta=100, got %v", result["delta"])
	}
	if result["newScore"].(float64) != 100 {
		t.Errorf("expected newScore=100, got %v", result["newScore"])
	}
}

func TestAnswer_Incorrect_OpensBuzzer(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	alice, _ := room.AddPlayer("Alice")
	room.AddPlayer("Bob")
	doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", testCategories())
	doPost(t, srv.URL+"/api/rooms/"+code+"/start", nil)
	doPost(t, srv.URL+"/api/rooms/"+code+"/question/q-1/open", nil)

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/answer", map[string]any{
		"playerId": alice.ID,
		"correct":  false,
	})
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var result map[string]any
	decode(t, resp, &result)
	if result["delta"].(float64) != -50 {
		t.Errorf("expected delta=-50, got %v", result["delta"])
	}
}

func TestAnswer_InvalidJSON(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	room.AddPlayer("Alice")
	doPost(t, srv.URL+"/api/rooms/"+code+"/start", nil)

	resp, _ := http.Post(srv.URL+"/api/rooms/"+code+"/answer", "application/json",
		bytes.NewReader([]byte("not-json")))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

// ---- POST /api/rooms/:code/question/close ----

func TestCloseQuestion(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	alice, _ := room.AddPlayer("Alice")
	doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", testCategories())
	doPost(t, srv.URL+"/api/rooms/"+code+"/start", nil)
	doPost(t, srv.URL+"/api/rooms/"+code+"/question/q-1/open", nil)
	doPost(t, srv.URL+"/api/rooms/"+code+"/answer", map[string]any{"playerId": alice.ID, "correct": true})

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/question/close", nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

// ---- POST /api/rooms/:code/question/reveal ----

func TestRevealAnswer(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	room.AddPlayer("Alice")
	doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", testCategories())
	doPost(t, srv.URL+"/api/rooms/"+code+"/start", nil)
	doPost(t, srv.URL+"/api/rooms/"+code+"/question/q-1/open", nil)

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/question/reveal", nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

// ---- POST /api/rooms/:code/question/end-buzzer ----

func TestEndBuzzerPhase(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	alice, _ := room.AddPlayer("Alice")
	room.AddPlayer("Bob")
	doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", testCategories())
	doPost(t, srv.URL+"/api/rooms/"+code+"/start", nil)
	doPost(t, srv.URL+"/api/rooms/"+code+"/question/q-1/open", nil)
	// Alice answers wrong → buzzer phase
	doPost(t, srv.URL+"/api/rooms/"+code+"/answer", map[string]any{"playerId": alice.ID, "correct": false})

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/question/end-buzzer", nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestEndBuzzerPhase_WrongPhase(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	room.AddPlayer("Alice")
	doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", testCategories())
	doPost(t, srv.URL+"/api/rooms/"+code+"/start", nil)
	// Phase is QUESTION_OPEN, not BUZZER_PHASE

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/question/end-buzzer", nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for end-buzzer in wrong phase, got %d", resp.StatusCode)
	}
}

// ---- POST /api/rooms/:code/players/shuffle ----

func TestShufflePlayers(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	room.AddPlayer("Alice")
	room.AddPlayer("Bob")

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/players/shuffle", nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

// ---- POST /api/rooms/:code/players/order ----

func TestSetPlayerOrder(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	p1, _ := room.AddPlayer("Alice")
	p2, _ := room.AddPlayer("Bob")

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/players/order", []string{p2.ID, p1.ID})
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	if room.ActivePlayer().ID != p2.ID {
		t.Error("expected Bob first after order change")
	}
}

// ---- POST /api/rooms/:code/players/:id/score ----

func TestSetPlayerScore(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	p, _ := room.AddPlayer("Alice")

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/players/"+p.ID+"/score",
		map[string]int{"score": 750})
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	if room.GetPlayer(p.ID).Score != 750 {
		t.Errorf("expected score=750, got %d", room.GetPlayer(p.ID).Score)
	}
}

func TestSetPlayerScore_Negative(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	p, _ := room.AddPlayer("Alice")

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/players/"+p.ID+"/score",
		map[string]int{"score": -500})
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	if room.GetPlayer(p.ID).Score != -500 {
		t.Errorf("expected score=-500, got %d", room.GetPlayer(p.ID).Score)
	}
}

func TestSetPlayerScore_PlayerNotFound(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/players/unknown-id/score",
		map[string]int{"score": 100})
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 for unknown player, got %d", resp.StatusCode)
	}
}

// ---- POST /api/rooms/:code/game ----

func TestSwitchGame_InLobby(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/game",
		map[string]string{"game_type": "jeopardy"})
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestSwitchGame_NotInLobby(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	room.AddPlayer("Alice")
	room.SetPhase(core.RoomPhaseInProgress)

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/game",
		map[string]string{"game_type": "jeopardy"})
	if resp.StatusCode != http.StatusConflict {
		t.Errorf("expected 409, got %d", resp.StatusCode)
	}
}

func TestSwitchGame_UnsupportedType(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/game",
		map[string]string{"game_type": "chess"})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

// ---- CORS ----

func TestCORSHeaders(t *testing.T) {
	srv, _ := newTestServer(t)

	resp, _ := http.Get(srv.URL + "/api/rooms")
	if resp.Header.Get("Access-Control-Allow-Origin") != "*" {
		t.Error("expected CORS Access-Control-Allow-Origin: *")
	}
}

func TestCORSPreflight(t *testing.T) {
	srv, _ := newTestServer(t)

	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/api/rooms", nil)
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("expected 204 for OPTIONS preflight, got %d", resp.StatusCode)
	}
}
