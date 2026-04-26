package core

import "github.com/google/uuid"

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
