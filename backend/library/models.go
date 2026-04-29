package library

import "time"

type QuizSummary struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	GameType      string    `json:"game_type"`
	CreatedAt     time.Time `json:"created_at"`
	QuestionCount int       `json:"question_count"`
}

type QuestionRow struct {
	ID         string `json:"id"`
	CategoryID string `json:"categoryId"`
	Points     int    `json:"points"`
	Text       string `json:"text"`
	Answer     string `json:"answer"`
	ImageURL   string `json:"imageUrl,omitempty"`
	AudioURL   string `json:"audioUrl,omitempty"`
	VideoURL   string `json:"videoUrl,omitempty"`
}

type CategoryRow struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Questions []QuestionRow `json:"questions"`
}

type QuizDetail struct {
	QuizSummary
	Categories []CategoryRow `json:"categories"`
}
