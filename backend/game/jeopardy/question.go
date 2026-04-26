package jeopardy

import "github.com/google/uuid"

// Question and Category are the jeopardy-package-local copies of the core types.
// They exist here so that in Phase 6 the core types can be removed and jeopardy
// becomes fully self-contained. JeopardyGame itself still uses core.Category /
// core.Question during Phase 2 because it interoperates with the Room and API layer.

type Question struct {
	ID         string `json:"id"`
	CategoryID string `json:"categoryId"`
	Points     int    `json:"points"`
	Text       string `json:"text"`
	Answer     string `json:"answer,omitempty"`
	ImageURL   string `json:"imageUrl,omitempty"`
	AudioURL   string `json:"audioUrl,omitempty"`
	VideoURL   string `json:"videoUrl,omitempty"`
	Played     bool   `json:"played"`
}

type Category struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Questions []Question `json:"questions"`
}

func NewQuestion(categoryID string, points int, text, imageURL, audioURL, videoURL string) Question {
	return Question{
		ID:         uuid.NewString(),
		CategoryID: categoryID,
		Points:     points,
		Text:       text,
		ImageURL:   imageURL,
		AudioURL:   audioURL,
		VideoURL:   videoURL,
	}
}

func NewCategory(name string) Category {
	return Category{
		ID:        uuid.NewString(),
		Name:      name,
		Questions: []Question{},
	}
}
