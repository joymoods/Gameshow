package jeopardy

// WS payload types for Jeopardy-specific messages sent over the WebSocket protocol.

type QuestionOpenedPayload struct {
	QuestionID string `json:"questionId"`
	Category   string `json:"category"`
	Points     int    `json:"points"`
	Text       string `json:"text"`
	Answer     string `json:"answer,omitempty"`
	ImageURL   string `json:"imageUrl,omitempty"`
	AudioURL   string `json:"audioUrl,omitempty"`
	VideoURL   string `json:"videoUrl,omitempty"`
}

type AnswerResultPayload struct {
	PlayerID    string `json:"playerId"`
	Correct     bool   `json:"correct"`
	PointsDelta int    `json:"pointsDelta"`
	NewScore    int    `json:"newScore"`
}

type BoardUpdatePayload struct {
	QuestionID string `json:"questionId"`
	Played     bool   `json:"played"`
}

type AnswerRevealedPayload struct {
	Answer string `json:"answer"`
}
