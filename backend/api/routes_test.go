package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"games/api"
	"games/game/core"
	"games/library"
	"games/ws"
)

// ---- test infrastructure ----

const testAdminToken = "test-admin-token"

// fakeLibraryStore is an in-memory implementation of library.Storer for tests.
type fakeLibraryStore struct {
	mu   sync.Mutex
	data map[string]*library.QuizDetail
	seq  int
}

func newFakeLibraryStore() *fakeLibraryStore {
	return &fakeLibraryStore{data: map[string]*library.QuizDetail{}}
}

func (f *fakeLibraryStore) List(_ context.Context) ([]library.QuizSummary, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]library.QuizSummary, 0, len(f.data))
	for _, d := range f.data {
		out = append(out, d.QuizSummary)
	}
	return out, nil
}

func (f *fakeLibraryStore) Get(_ context.Context, id string) (*library.QuizDetail, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	d, ok := f.data[id]
	if !ok {
		return nil, nil
	}
	return d, nil
}

func (f *fakeLibraryStore) Create(_ context.Context, name, description, gameType string, categories []core.Category) (*library.QuizSummary, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.seq++
	id := "quiz-" + string(rune('0'+f.seq))
	cats := make([]library.CategoryRow, 0, len(categories))
	qCount := 0
	for _, c := range categories {
		qCount += len(c.Questions)
		cr := library.CategoryRow{ID: c.ID, Name: c.Name}
		cats = append(cats, cr)
	}
	s := library.QuizSummary{ID: id, Name: name, Description: description, GameType: gameType, CreatedAt: time.Now(), QuestionCount: qCount}
	f.data[id] = &library.QuizDetail{QuizSummary: s, Categories: cats}
	return &s, nil
}

func (f *fakeLibraryStore) Update(_ context.Context, id, name, description string, _ []core.Category) (*library.QuizSummary, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	d, ok := f.data[id]
	if !ok {
		return nil, nil
	}
	d.Name = name
	d.Description = description
	s := d.QuizSummary
	return &s, nil
}

func (f *fakeLibraryStore) Delete(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.data[id]; !ok {
		return fmt.Errorf("quiz not found")
	}
	delete(f.data, id)
	return nil
}

func newTestServer(t *testing.T) (*httptest.Server, *core.Manager) {
	t.Helper()
	return newTestServerWithStore(t, newFakeLibraryStore())
}

func newTestServerWithStore(t *testing.T, store library.Storer) (*httptest.Server, *core.Manager) {
	t.Helper()
	t.Setenv("ADMIN_TOKEN", testAdminToken)
	manager := core.NewManager()
	hub := ws.NewHub()
	wsHandler := ws.NewHandler(hub, manager)
	router := api.NewRouter(manager, wsHandler, store)
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

func doGet(t *testing.T, url string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatalf("NewRequest GET: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+testAdminToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	return resp
}

func doPost(t *testing.T, url string, body any) *http.Response {
	t.Helper()
	var r *bytes.Reader
	if body != nil {
		r = jsonBody(t, body)
	} else {
		r = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(http.MethodPost, url, r)
	if err != nil {
		t.Fatalf("NewRequest POST: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+testAdminToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	return resp
}

func doPostRaw(t *testing.T, url string, rawBody []byte) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(rawBody))
	if err != nil {
		t.Fatalf("NewRequest POST: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+testAdminToken)
	resp, err := http.DefaultClient.Do(req)
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
	req.Header.Set("Authorization", "Bearer "+testAdminToken)
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

	resp := doGet(t, srv.URL+"/api/rooms")
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

	resp := doGet(t, srv.URL+"/api/rooms")
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

	resp := doPostRaw(t, srv.URL+"/api/rooms", []byte("not-json"))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid JSON, got %d", resp.StatusCode)
	}
}

// ---- GET /api/rooms/:code ----

func TestGetRoom_Found(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	resp := doGet(t, srv.URL+"/api/rooms/"+code)
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

	resp := doGet(t, srv.URL+"/api/rooms/XXXXXX")
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

	resp2 := doGet(t, srv.URL+"/api/rooms/"+code)
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

	resp := doPostRaw(t, srv.URL+"/api/rooms/"+code+"/quiz", []byte("not-json"))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

// ---- GET /api/rooms/:code/export ----

func TestExportQuiz(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)
	doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", testCategories())

	resp := doGet(t, srv.URL+"/api/rooms/"+code+"/export")
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

	resp := doGet(t, srv.URL+"/api/rooms/"+code+"/export")
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
	alice, _, _ := room.AddPlayer("Alice")
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
	alice, _, _ := room.AddPlayer("Alice")
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

	resp := doPostRaw(t, srv.URL+"/api/rooms/"+code+"/answer", []byte("not-json"))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

// ---- POST /api/rooms/:code/question/close ----

func TestCloseQuestion(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	alice, _, _ := room.AddPlayer("Alice")
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
	alice, _, _ := room.AddPlayer("Alice")
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
	p1, _, _ := room.AddPlayer("Alice")
	p2, _, _ := room.AddPlayer("Bob")

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
	p, _, _ := room.AddPlayer("Alice")

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
	p, _, _ := room.AddPlayer("Alice")

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

// ---- auth rejection ----

func TestRooms_UnauthenticatedReturns401(t *testing.T) {
	srv, _ := newTestServer(t)

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/rooms", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauthenticated GET /api/rooms, got %d", resp.StatusCode)
	}
}

// ---- CORS ----

func TestCORSHeaders(t *testing.T) {
	srv, _ := newTestServer(t)

	// CORS headers are set by withCORS before auth runs, so they appear even on 401.
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/rooms", nil)
	resp, _ := http.DefaultClient.Do(req)
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

// ---- GET /api/room-info/:code (public) ----

func TestPublicRoomInfo(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/room-info/"+code, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var result map[string]string
	decode(t, resp, &result)
	if result["game_type"] != "jeopardy" {
		t.Errorf("expected game_type=jeopardy, got %q", result["game_type"])
	}
	if result["room_phase"] != "LOBBY" {
		t.Errorf("expected room_phase=LOBBY, got %q", result["room_phase"])
	}
}

func TestPublicRoomInfo_NoAuth(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	// No auth header — public endpoint must respond with 200 regardless.
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/room-info/"+code, nil)
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 without auth header, got %d", resp.StatusCode)
	}
}

func TestPublicRoomInfo_NotFound(t *testing.T) {
	srv, _ := newTestServer(t)

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/room-info/XXXXXX", nil)
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// ---- DELETE /api/rooms/:code/players/:id (kick) ----

func TestKickPlayer(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	p, _, _ := room.AddPlayer("Alice")

	resp := doDelete(t, srv.URL+"/api/rooms/"+code+"/players/"+p.ID)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	if room.GetPlayer(p.ID) != nil {
		t.Error("expected player to be removed after kick")
	}
}

func TestKickPlayer_NotFound(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	resp := doDelete(t, srv.URL+"/api/rooms/"+code+"/players/unknown-player-id")
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

func TestKickPlayer_Unauthenticated(t *testing.T) {
	srv, manager := newTestServer(t)
	code := createRoom(t, srv)
	room, _ := manager.GetRoom(code)
	p, _, _ := room.AddPlayer("Alice")

	req, _ := http.NewRequest(http.MethodDelete, srv.URL+"/api/rooms/"+code+"/players/"+p.ID, nil)
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

// ---- POST /api/rooms/:code/question/timer ----

func TestQuestionTimer_Start(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/question/timer", map[string]int{"seconds": 30})
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var result map[string]any
	decode(t, resp, &result)
	if _, ok := result["endsAt"]; !ok {
		t.Error("expected endsAt in response")
	}
	if _, ok := result["durationMs"]; !ok {
		t.Error("expected durationMs in response")
	}
}

func TestQuestionTimer_Stop(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)
	// Start a timer first.
	doPost(t, srv.URL+"/api/rooms/"+code+"/question/timer", map[string]int{"seconds": 30})

	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/question/timer", map[string]int{"seconds": 0})
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var result map[string]string
	decode(t, resp, &result)
	if result["status"] != "stopped" {
		t.Errorf("expected status=stopped, got %q", result["status"])
	}
}

func TestQuestionTimer_Unauthenticated(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/rooms/"+code+"/question/timer",
		bytes.NewReader([]byte(`{"seconds":30}`)))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

// ---- Board validation (POST /api/rooms/:code/quiz) ----

func TestUploadQuiz_TooManyCategories(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	cats := make([]core.Category, 7) // limit is 6
	for i := range cats {
		cats[i] = core.Category{ID: fmt.Sprintf("cat-%d", i), Name: fmt.Sprintf("Cat%d", i)}
	}
	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", cats)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for >6 categories, got %d", resp.StatusCode)
	}
}

func TestUploadQuiz_TooManyQuestionsPerCategory(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	questions := make([]core.Question, 6) // limit is 5
	for i := range questions {
		questions[i] = core.Question{ID: fmt.Sprintf("q-%d", i), Points: 100, Text: "Q?", Answer: "A"}
	}
	cats := []core.Category{{ID: "cat-1", Name: "Big", Questions: questions}}
	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", cats)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for >5 questions per category, got %d", resp.StatusCode)
	}
}

func TestUploadQuiz_MaxCategories(t *testing.T) {
	srv, _ := newTestServer(t)
	code := createRoom(t, srv)

	cats := make([]core.Category, 6) // exactly at limit
	for i := range cats {
		cats[i] = core.Category{
			ID:   fmt.Sprintf("cat-%d", i),
			Name: fmt.Sprintf("Cat%d", i),
			Questions: []core.Question{
				{ID: fmt.Sprintf("q-%d", i), Points: 100, Text: "Q?", Answer: "A"},
			},
		}
	}
	resp := doPost(t, srv.URL+"/api/rooms/"+code+"/quiz", cats)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 for exactly 6 categories, got %d", resp.StatusCode)
	}
}

// ---- GET/POST/PUT/DELETE /api/library ----

func TestLibrary_GetList_Empty(t *testing.T) {
	srv, _ := newTestServer(t)

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/library", nil)
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var list []any
	decode(t, resp, &list)
	if len(list) != 0 {
		t.Errorf("expected empty list, got %d entries", len(list))
	}
}

func TestLibrary_Create(t *testing.T) {
	srv, _ := newTestServer(t)

	resp := doPost(t, srv.URL+"/api/library", map[string]any{
		"name":      "Test Quiz",
		"game_type": "jeopardy",
		"categories": []core.Category{
			{ID: "cat-1", Name: "Geo", Questions: []core.Question{
				{ID: "q-1", Points: 100, Text: "Capital?", Answer: "Berlin"},
			}},
		},
	})
	if resp.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got %d", resp.StatusCode)
	}
	var summary map[string]any
	decode(t, resp, &summary)
	if summary["name"] != "Test Quiz" {
		t.Errorf("expected name=Test Quiz, got %v", summary["name"])
	}
}

func TestLibrary_Create_Unauthenticated(t *testing.T) {
	srv, _ := newTestServer(t)

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/library",
		bytes.NewReader([]byte(`{"name":"Quiz","game_type":"jeopardy","categories":[]}`)))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 without auth, got %d", resp.StatusCode)
	}
}

func TestLibrary_Create_MissingName(t *testing.T) {
	srv, _ := newTestServer(t)

	resp := doPost(t, srv.URL+"/api/library", map[string]any{
		"game_type":  "jeopardy",
		"categories": []any{},
	})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for missing name, got %d", resp.StatusCode)
	}
}

func TestLibrary_GetByID(t *testing.T) {
	srv, _ := newTestServer(t)

	// Create first.
	createResp := doPost(t, srv.URL+"/api/library", map[string]any{
		"name":       "My Quiz",
		"game_type":  "jeopardy",
		"categories": []any{},
	})
	var summary map[string]any
	decode(t, createResp, &summary)
	id := summary["id"].(string)

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/library/"+id, nil)
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var detail map[string]any
	decode(t, resp, &detail)
	if detail["name"] != "My Quiz" {
		t.Errorf("expected name=My Quiz, got %v", detail["name"])
	}
}

func TestLibrary_GetByID_NotFound(t *testing.T) {
	srv, _ := newTestServer(t)

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/library/nonexistent-id", nil)
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

func doPut(t *testing.T, url string, body any) *http.Response {
	t.Helper()
	r := jsonBody(t, body)
	req, err := http.NewRequest(http.MethodPut, url, r)
	if err != nil {
		t.Fatalf("NewRequest PUT: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+testAdminToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("PUT %s: %v", url, err)
	}
	return resp
}

func TestLibrary_Update(t *testing.T) {
	srv, _ := newTestServer(t)

	createResp := doPost(t, srv.URL+"/api/library", map[string]any{
		"name":       "Original",
		"game_type":  "jeopardy",
		"categories": []any{},
	})
	var summary map[string]any
	decode(t, createResp, &summary)
	id := summary["id"].(string)

	resp := doPut(t, srv.URL+"/api/library/"+id, map[string]any{
		"name":       "Updated",
		"categories": []any{},
	})
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestLibrary_Update_Unauthenticated(t *testing.T) {
	srv, _ := newTestServer(t)

	req, _ := http.NewRequest(http.MethodPut, srv.URL+"/api/library/some-id",
		bytes.NewReader([]byte(`{"name":"Updated","categories":[]}`)))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestLibrary_Delete(t *testing.T) {
	srv, _ := newTestServer(t)

	createResp := doPost(t, srv.URL+"/api/library", map[string]any{
		"name":       "ToDelete",
		"game_type":  "jeopardy",
		"categories": []any{},
	})
	var summary map[string]any
	decode(t, createResp, &summary)
	id := summary["id"].(string)

	resp := doDelete(t, srv.URL+"/api/library/"+id)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	// Verify it's gone.
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/library/"+id, nil)
	getResp, _ := http.DefaultClient.Do(req)
	if getResp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 after delete, got %d", getResp.StatusCode)
	}
}

func TestLibrary_Delete_Unauthenticated(t *testing.T) {
	srv, _ := newTestServer(t)

	req, _ := http.NewRequest(http.MethodDelete, srv.URL+"/api/library/some-id", nil)
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestLibrary_Delete_NotFound(t *testing.T) {
	srv, _ := newTestServer(t)

	resp := doDelete(t, srv.URL+"/api/library/nonexistent-id")
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 for unknown quiz, got %d", resp.StatusCode)
	}
}
