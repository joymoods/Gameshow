package jeopardy

import (
	"testing"

	"games/game/core"
)

// ---- test helpers ----

func makeRoom(playerNames ...string) *core.Room {
	m := core.NewManager()
	room := m.CreateRoom()
	for _, name := range playerNames {
		room.AddPlayer(name)
	}
	return room
}

func testCategories() []core.Category {
	return []core.Category{
		{
			ID:   "cat-1",
			Name: "Geographie",
			Questions: []core.Question{
				{ID: "q-1", CategoryID: "cat-1", Points: 100, Text: "Hauptstadt Deutschlands?", Answer: "Berlin"},
				{ID: "q-2", CategoryID: "cat-1", Points: 200, Text: "Längster Fluss der Welt?", Answer: "Nil"},
			},
		},
		{
			ID:   "cat-2",
			Name: "Wissenschaft",
			Questions: []core.Question{
				{ID: "q-3", CategoryID: "cat-2", Points: 100, Text: "Formel für Wasser?", Answer: "H2O"},
			},
		},
	}
}

// setupGame creates a started game with quiz loaded.
// Quiz must be loaded before OnStart (mirroring the real API flow).
func setupGame(t *testing.T, playerNames ...string) (*JeopardyGame, *core.Room) {
	t.Helper()
	room := makeRoom(playerNames...)
	game := New()
	room.Game = game
	if _, err := game.HandleAdminCommand("load_quiz", map[string]any{
		"categories": testCategories(),
	}); err != nil {
		t.Fatalf("load_quiz failed: %v", err)
	}
	if err := game.OnStart(room); err != nil {
		t.Fatalf("OnStart failed: %v", err)
	}
	return game, room
}

func currentPhase(g *JeopardyGame) string {
	return g.Snapshot()["current_phase"].(string)
}

// findOtherPlayer returns the first player whose ID differs from skipID.
func findOtherPlayer(room *core.Room, skipID string) *core.Player {
	for _, p := range room.Players {
		if p.ID != skipID {
			return p
		}
	}
	return nil
}

// openAndAnswerWrong is a helper that opens a question and has the active player
// answer wrong, putting the game into BUZZER_PHASE.
func openAndAnswerWrong(t *testing.T, game *JeopardyGame, room *core.Room, questionID string) *core.Player {
	t.Helper()
	if _, err := game.HandleAdminCommand("open_question", map[string]any{"questionId": questionID}); err != nil {
		t.Fatalf("open_question failed: %v", err)
	}
	active := room.ActivePlayer()
	if _, err := game.HandleAdminCommand("answer", map[string]any{
		"playerId": active.ID,
		"correct":  false,
	}); err != nil {
		t.Fatalf("answer (wrong) failed: %v", err)
	}
	return active
}

// ---- OnStart ----

func TestOnStart_SetsPhaseQuestionOpen(t *testing.T) {
	room := makeRoom("Alice")
	game := New()

	// OnStart requires a quiz to be loaded first.
	if _, err := game.HandleAdminCommand("load_quiz", map[string]any{
		"categories": testCategories(),
	}); err != nil {
		t.Fatalf("load_quiz error: %v", err)
	}
	if err := game.OnStart(room); err != nil {
		t.Fatalf("OnStart error: %v", err)
	}
	if currentPhase(game) != string(PhaseQuestionOpen) {
		t.Errorf("expected QUESTION_OPEN after OnStart, got %q", currentPhase(game))
	}
}

func TestOnStart_FailsWithoutQuiz(t *testing.T) {
	room := makeRoom("Alice")
	game := New()

	if err := game.OnStart(room); err == nil {
		t.Error("expected error when starting game without quiz loaded")
	}
}

// ---- load_quiz ----

func TestLoadQuiz_Valid(t *testing.T) {
	game := New()
	_, err := game.HandleAdminCommand("load_quiz", map[string]any{
		"categories": testCategories(),
	})
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	snap := game.Snapshot()
	board := snap["board"].([]core.Category)
	if len(board) != 2 {
		t.Errorf("expected 2 categories, got %d", len(board))
	}
}

func TestLoadQuiz_InvalidPayload(t *testing.T) {
	game := New()
	_, err := game.HandleAdminCommand("load_quiz", map[string]any{
		"categories": "not-a-slice",
	})
	if err == nil {
		t.Error("expected error for invalid categories payload")
	}
}

// ---- open_question ----

func TestOpenQuestion_Success(t *testing.T) {
	game, _ := setupGame(t, "Alice")

	result, err := game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	if err != nil {
		t.Fatalf("open_question error: %v", err)
	}

	res := result.(map[string]any)
	q := res["question"].(*core.Question)
	if q.ID != "q-1" {
		t.Errorf("expected question q-1, got %q", q.ID)
	}
	if res["categoryName"] != "Geographie" {
		t.Errorf("expected categoryName=Geographie, got %v", res["categoryName"])
	}
	if currentPhase(game) != string(PhaseActivePlayerAnswering) {
		t.Errorf("expected ACTIVE_PLAYER_ANSWERING, got %q", currentPhase(game))
	}
}

func TestOpenQuestion_WrongPhase(t *testing.T) {
	game, _ := setupGame(t, "Alice")

	game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	// now in ACTIVE_PLAYER_ANSWERING

	_, err := game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-2"})
	if err == nil {
		t.Error("expected error: open_question in ACTIVE_PLAYER_ANSWERING phase")
	}
}

func TestOpenQuestion_NotFound(t *testing.T) {
	game, _ := setupGame(t, "Alice")

	_, err := game.HandleAdminCommand("open_question", map[string]any{"questionId": "nonexistent"})
	if err == nil {
		t.Error("expected error for nonexistent question ID")
	}
}

func TestOpenQuestion_AlreadyPlayed(t *testing.T) {
	game, room := setupGame(t, "Alice")
	alice := room.ActivePlayer()

	game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	game.HandleAdminCommand("answer", map[string]any{"playerId": alice.ID, "correct": true})
	game.HandleAdminCommand("close_question", map[string]any{})

	_, err := game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	if err == nil {
		t.Error("expected error for already-played question")
	}
}

func TestOpenQuestion_ResetsBuzzerState(t *testing.T) {
	game, room := setupGame(t, "Alice", "Bob")
	alice := room.ActivePlayer()

	// Q1: Alice (active) answers wrong → Bob buzzes → end_buzzer → close
	// After close, Bob becomes the active player for Q2.
	game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	game.HandleAdminCommand("answer", map[string]any{"playerId": alice.ID, "correct": false})
	bob := findOtherPlayer(room, alice.ID)
	game.HandlePlayerMessage(bob.ID, "BUZZ", nil)
	game.HandleAdminCommand("end_buzzer", map[string]any{})
	game.HandleAdminCommand("close_question", map[string]any{})

	// Q2: Bob is now active player, answers wrong → buzzer phase.
	// The buzzedPlayers map is reset when the new question opens,
	// so Alice (who was excluded on Q1) can buzz again.
	game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-2"})
	newActive := room.ActivePlayer() // Bob
	game.HandleAdminCommand("answer", map[string]any{"playerId": newActive.ID, "correct": false})

	// Alice's buzzer exclusion from Q1 must not carry over to Q2.
	err := game.HandlePlayerMessage(alice.ID, "BUZZ", nil)
	if err != nil {
		t.Errorf("expected Alice to buzz on new question (state reset), got: %v", err)
	}
}

// ---- answer ----

func TestAnswer_ActivePlayerCorrect(t *testing.T) {
	game, room := setupGame(t, "Alice")
	alice := room.ActivePlayer()

	game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	result, err := game.HandleAdminCommand("answer", map[string]any{
		"playerId": alice.ID,
		"correct":  true,
	})
	if err != nil {
		t.Fatalf("answer error: %v", err)
	}

	res := result.(map[string]any)
	if res["delta"] != 100 {
		t.Errorf("expected delta=100, got %v", res["delta"])
	}
	if res["newScore"] != 100 {
		t.Errorf("expected newScore=100, got %v", res["newScore"])
	}
	if res["buzzerOpen"] != false {
		t.Error("expected buzzerOpen=false for correct answer")
	}
	if currentPhase(game) != string(PhaseQuestionDone) {
		t.Errorf("expected QUESTION_DONE, got %q", currentPhase(game))
	}
}

func TestAnswer_ActivePlayerWrong_OpensBuzzer(t *testing.T) {
	game, room := setupGame(t, "Alice", "Bob")
	alice := room.ActivePlayer()

	game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	result, err := game.HandleAdminCommand("answer", map[string]any{
		"playerId": alice.ID,
		"correct":  false,
	})
	if err != nil {
		t.Fatalf("answer error: %v", err)
	}

	res := result.(map[string]any)
	if res["delta"] != -50 {
		t.Errorf("expected delta=-50, got %v", res["delta"])
	}
	if res["buzzerOpen"] != true {
		t.Error("expected buzzerOpen=true when active player answers wrong")
	}
	if currentPhase(game) != string(PhaseBuzzerPhase) {
		t.Errorf("expected BUZZER_PHASE, got %q", currentPhase(game))
	}
}

func TestAnswer_WrongPlayerID(t *testing.T) {
	game, _ := setupGame(t, "Alice")

	game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	_, err := game.HandleAdminCommand("answer", map[string]any{
		"playerId": "not-the-active-player-id",
		"correct":  true,
	})
	if err == nil {
		t.Error("expected error when answering with wrong player ID")
	}
}

func TestAnswer_NoActiveQuestion(t *testing.T) {
	game, room := setupGame(t, "Alice")
	alice := room.ActivePlayer()

	_, err := game.HandleAdminCommand("answer", map[string]any{
		"playerId": alice.ID,
		"correct":  true,
	})
	if err == nil {
		t.Error("expected error when no active question")
	}
}

func TestAnswer_Buzzer_HalfPointsCorrect(t *testing.T) {
	game, room := setupGame(t, "Alice", "Bob")
	alice := openAndAnswerWrong(t, game, room, "q-1") // 100 points
	bob := findOtherPlayer(room, alice.ID)

	game.HandlePlayerMessage(bob.ID, "BUZZ", nil)
	result, err := game.HandleAdminCommand("answer", map[string]any{
		"playerId": bob.ID,
		"correct":  true,
	})
	if err != nil {
		t.Fatalf("answer error: %v", err)
	}

	res := result.(map[string]any)
	if res["delta"] != 50 {
		t.Errorf("expected delta=50 (half points) for buzzer correct, got %v", res["delta"])
	}
	if res["buzzerOpen"] != false {
		t.Error("expected buzzerOpen=false after correct buzzer answer")
	}
	if currentPhase(game) != string(PhaseQuestionDone) {
		t.Errorf("expected QUESTION_DONE, got %q", currentPhase(game))
	}
}

func TestAnswer_Buzzer_Wrong_RemainingBuzzers(t *testing.T) {
	game, room := setupGame(t, "Alice", "Bob", "Charlie")
	alice := openAndAnswerWrong(t, game, room, "q-1")
	bob := findOtherPlayer(room, alice.ID)

	game.HandlePlayerMessage(bob.ID, "BUZZ", nil)
	result, _ := game.HandleAdminCommand("answer", map[string]any{
		"playerId": bob.ID,
		"correct":  false,
	})

	res := result.(map[string]any)
	if res["buzzerOpen"] != true {
		t.Error("expected buzzerOpen=true: Charlie hasn't buzzed yet")
	}
	if currentPhase(game) != string(PhaseBuzzerPhase) {
		t.Errorf("expected BUZZER_PHASE to continue, got %q", currentPhase(game))
	}
}

func TestAnswer_Buzzer_Wrong_NoBuzzersLeft(t *testing.T) {
	game, room := setupGame(t, "Alice", "Bob")
	alice := openAndAnswerWrong(t, game, room, "q-1")
	bob := findOtherPlayer(room, alice.ID)

	game.HandlePlayerMessage(bob.ID, "BUZZ", nil)
	result, _ := game.HandleAdminCommand("answer", map[string]any{
		"playerId": bob.ID,
		"correct":  false,
	})

	res := result.(map[string]any)
	if res["buzzerOpen"] != false {
		t.Error("expected buzzerOpen=false: no remaining buzzers")
	}
	if currentPhase(game) != string(PhaseQuestionDone) {
		t.Errorf("expected QUESTION_DONE when all buzzers exhausted, got %q", currentPhase(game))
	}
}

// ---- HandlePlayerMessage (BUZZ) ----

func TestBuzz_Accepted(t *testing.T) {
	game, room := setupGame(t, "Alice", "Bob")
	alice := openAndAnswerWrong(t, game, room, "q-1")
	bob := findOtherPlayer(room, alice.ID)

	if err := game.HandlePlayerMessage(bob.ID, "BUZZ", nil); err != nil {
		t.Errorf("expected buzz to be accepted, got: %v", err)
	}
}

func TestBuzz_RejectedOutsideBuzzerPhase(t *testing.T) {
	game, room := setupGame(t, "Alice")

	game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	// phase: ACTIVE_PLAYER_ANSWERING

	err := game.HandlePlayerMessage(room.ActivePlayer().ID, "BUZZ", nil)
	if err == nil {
		t.Error("expected buzz rejected: not in BUZZER_PHASE")
	}
}

func TestBuzz_RejectedIfAlreadyBuzzed(t *testing.T) {
	game, room := setupGame(t, "Alice", "Bob", "Charlie")
	alice := openAndAnswerWrong(t, game, room, "q-1")
	bob := findOtherPlayer(room, alice.ID)

	// Bob buzzes, answers wrong — phase stays BUZZER_PHASE (Charlie remains)
	game.HandlePlayerMessage(bob.ID, "BUZZ", nil)
	game.HandleAdminCommand("answer", map[string]any{"playerId": bob.ID, "correct": false})

	// Bob tries to buzz again
	err := game.HandlePlayerMessage(bob.ID, "BUZZ", nil)
	if err == nil {
		t.Error("expected buzz rejected: player already buzzed this question")
	}
}

func TestBuzz_RejectedIfBuzzerTaken(t *testing.T) {
	game, room := setupGame(t, "Alice", "Bob", "Charlie")
	alice := openAndAnswerWrong(t, game, room, "q-1")
	bob := findOtherPlayer(room, alice.ID)

	// Bob buzzes first
	game.HandlePlayerMessage(bob.ID, "BUZZ", nil)

	// Charlie tries to buzz while Bob holds the buzzer
	var charlie *core.Player
	for _, p := range room.Players {
		if p.ID != alice.ID && p.ID != bob.ID {
			charlie = p
			break
		}
	}
	err := game.HandlePlayerMessage(charlie.ID, "BUZZ", nil)
	if err == nil {
		t.Error("expected buzz rejected: buzzer already taken by Bob")
	}
}

func TestBuzz_UnknownMessageType(t *testing.T) {
	game, room := setupGame(t, "Alice")
	err := game.HandlePlayerMessage(room.ActivePlayer().ID, "UNKNOWN_MSG", nil)
	if err == nil {
		t.Error("expected error for unknown message type")
	}
}

// ---- close_question ----

func TestCloseQuestion_AdvancesActivePlayer(t *testing.T) {
	game, room := setupGame(t, "Alice", "Bob")
	alice := room.ActivePlayer()

	game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	game.HandleAdminCommand("answer", map[string]any{"playerId": alice.ID, "correct": true})
	result, err := game.HandleAdminCommand("close_question", map[string]any{})
	if err != nil {
		t.Fatalf("close_question error: %v", err)
	}

	res := result.(map[string]any)
	if res["gameOver"].(bool) {
		t.Error("expected gameOver=false with questions remaining")
	}

	newActive := room.ActivePlayer()
	if newActive.ID == alice.ID {
		t.Error("expected active player to advance after close_question")
	}
	if currentPhase(game) != string(PhaseQuestionOpen) {
		t.Errorf("expected QUESTION_OPEN, got %q", currentPhase(game))
	}
}

func TestCloseQuestion_MarksQuestionPlayed(t *testing.T) {
	game, room := setupGame(t, "Alice")
	alice := room.ActivePlayer()

	game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	game.HandleAdminCommand("answer", map[string]any{"playerId": alice.ID, "correct": true})
	game.HandleAdminCommand("close_question", map[string]any{})

	// Trying to open q-1 again should fail (already played)
	_, err := game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	if err == nil {
		t.Error("expected error: q-1 should be marked played after close_question")
	}
}

func TestCloseQuestion_GameOver_AllQuestionsPlayed(t *testing.T) {
	game, room := setupGame(t, "Alice")

	for _, qID := range []string{"q-1", "q-2", "q-3"} {
		alice := room.ActivePlayer()
		game.HandleAdminCommand("open_question", map[string]any{"questionId": qID})
		game.HandleAdminCommand("answer", map[string]any{"playerId": alice.ID, "correct": true})
		res, _ := game.HandleAdminCommand("close_question", map[string]any{})
		r := res.(map[string]any)
		if qID != "q-3" && r["gameOver"].(bool) {
			t.Errorf("expected gameOver=false before last question, got true at %s", qID)
		}
	}

	if currentPhase(game) != string(PhaseGameOver) {
		t.Errorf("expected GAME_OVER after all questions played, got %q", currentPhase(game))
	}
}

// ---- reveal ----

func TestReveal_ReturnsAnswer(t *testing.T) {
	game, _ := setupGame(t, "Alice")

	game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	result, err := game.HandleAdminCommand("reveal", map[string]any{})
	if err != nil {
		t.Fatalf("reveal error: %v", err)
	}

	res := result.(map[string]any)
	if res["answer"] != "Berlin" {
		t.Errorf("expected answer=Berlin, got %q", res["answer"])
	}
}

func TestReveal_NoQuestion_ReturnsError(t *testing.T) {
	game, _ := setupGame(t, "Alice")

	_, err := game.HandleAdminCommand("reveal", map[string]any{})
	if err == nil {
		t.Fatal("expected error when revealing with no active question")
	}
}

// ---- end_buzzer ----

func TestEndBuzzer_Success(t *testing.T) {
	game, room := setupGame(t, "Alice", "Bob")
	openAndAnswerWrong(t, game, room, "q-1") // puts us in BUZZER_PHASE

	_, err := game.HandleAdminCommand("end_buzzer", map[string]any{})
	if err != nil {
		t.Fatalf("end_buzzer error: %v", err)
	}
	if currentPhase(game) != string(PhaseQuestionDone) {
		t.Errorf("expected QUESTION_DONE after end_buzzer, got %q", currentPhase(game))
	}
}

func TestEndBuzzer_WrongPhase(t *testing.T) {
	game, _ := setupGame(t, "Alice")
	// phase: QUESTION_OPEN

	_, err := game.HandleAdminCommand("end_buzzer", map[string]any{})
	if err == nil {
		t.Error("expected error for end_buzzer in non-BUZZER_PHASE")
	}
}

// ---- unknown command ----

func TestUnknownCommand(t *testing.T) {
	game := New()
	_, err := game.HandleAdminCommand("fly_to_moon", map[string]any{})
	if err == nil {
		t.Error("expected error for unknown admin command")
	}
}

// ---- Snapshot ----

func TestSnapshot_Board(t *testing.T) {
	game, _ := setupGame(t, "Alice")

	snap := game.Snapshot()
	board := snap["board"].([]core.Category)
	if len(board) != 2 {
		t.Errorf("expected 2 categories in board, got %d", len(board))
	}
}

func TestSnapshot_CurrentQuestion(t *testing.T) {
	game, _ := setupGame(t, "Alice")

	// No question open
	if game.Snapshot()["current_question"] != nil {
		t.Error("expected nil current_question before opening")
	}

	game.HandleAdminCommand("open_question", map[string]any{"questionId": "q-1"})
	snap := game.Snapshot()
	q, ok := snap["current_question"].(core.Question)
	if !ok {
		t.Fatalf("expected current_question to be a core.Question, got %T", snap["current_question"])
	}
	if q.ID != "q-1" {
		t.Errorf("expected current_question.ID=q-1, got %q", q.ID)
	}
}
