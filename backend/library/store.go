package library

import (
	"context"
	"fmt"
	"sort"

	"games/game/core"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Storer is the interface the API layer uses for library operations.
// Using an interface keeps the API package free of pgxpool and allows
// an in-memory stub in tests.
type Storer interface {
	List(ctx context.Context) ([]QuizSummary, error)
	Get(ctx context.Context, id string) (*QuizDetail, error)
	Create(ctx context.Context, name, description, gameType string, categories []core.Category) (*QuizSummary, error)
	Update(ctx context.Context, id, name, description string, categories []core.Category) (*QuizSummary, error)
	Delete(ctx context.Context, id string) error
}

type QuizStore struct {
	pool *pgxpool.Pool
}

func NewQuizStore(pool *pgxpool.Pool) *QuizStore {
	return &QuizStore{pool: pool}
}

func (s *QuizStore) List(ctx context.Context) ([]QuizSummary, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT q.id, q.name, q.description, q.game_type, q.created_at,
		       COUNT(qq.id) AS question_count
		FROM quizzes q
		LEFT JOIN quiz_categories qc ON qc.quiz_id = q.id
		LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id AND qq.category_id = qc.id
		GROUP BY q.id
		ORDER BY q.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var summaries []QuizSummary
	for rows.Next() {
		var s QuizSummary
		if err := rows.Scan(&s.ID, &s.Name, &s.Description, &s.GameType, &s.CreatedAt, &s.QuestionCount); err != nil {
			return nil, err
		}
		summaries = append(summaries, s)
	}
	if summaries == nil {
		summaries = []QuizSummary{}
	}
	return summaries, rows.Err()
}

func (s *QuizStore) Get(ctx context.Context, id string) (*QuizDetail, error) {
	var detail QuizDetail
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, description, game_type, created_at FROM quizzes WHERE id = $1`, id,
	).Scan(&detail.ID, &detail.Name, &detail.Description, &detail.GameType, &detail.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx, `
		SELECT qc.id, qc.name, qc.position,
		       qq.id, qq.points, qq.text, qq.answer, qq.image_url, qq.audio_url, qq.video_url, qq.position
		FROM quiz_categories qc
		LEFT JOIN quiz_questions qq ON qq.category_id = qc.id AND qq.quiz_id = qc.quiz_id
		WHERE qc.quiz_id = $1
		ORDER BY qc.position, qq.position
	`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type catEntry struct {
		pos int
		cat CategoryRow
	}
	catMap := map[string]*catEntry{}
	catOrder := []string{}

	for rows.Next() {
		var (
			catID, catName    string
			catPos            int
			qID, qText, qAns  *string
			qImg, qAud, qVid  *string
			qPoints, qPos     *int
		)
		if err := rows.Scan(
			&catID, &catName, &catPos,
			&qID, &qPoints, &qText, &qAns, &qImg, &qAud, &qVid, &qPos,
		); err != nil {
			return nil, err
		}
		if _, ok := catMap[catID]; !ok {
			catMap[catID] = &catEntry{pos: catPos, cat: CategoryRow{ID: catID, Name: catName}}
			catOrder = append(catOrder, catID)
		}
		if qID != nil {
			q := QuestionRow{
				ID:         *qID,
				CategoryID: catID,
				Points:     *qPoints,
				Text:       *qText,
				Answer:     *qAns,
			}
			if qImg != nil {
				q.ImageURL = *qImg
			}
			if qAud != nil {
				q.AudioURL = *qAud
			}
			if qVid != nil {
				q.VideoURL = *qVid
			}
			catMap[catID].cat.Questions = append(catMap[catID].cat.Questions, q)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	sort.Slice(catOrder, func(i, j int) bool {
		return catMap[catOrder[i]].pos < catMap[catOrder[j]].pos
	})
	for _, cid := range catOrder {
		detail.Categories = append(detail.Categories, catMap[cid].cat)
	}
	if detail.Categories == nil {
		detail.Categories = []CategoryRow{}
	}
	return &detail, nil
}

func (s *QuizStore) Create(ctx context.Context, name, description, gameType string, categories []core.Category) (*QuizSummary, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var id string
	err = tx.QueryRow(ctx,
		`INSERT INTO quizzes(name, description, game_type) VALUES($1, $2, $3) RETURNING id`,
		name, description, gameType,
	).Scan(&id)
	if err != nil {
		return nil, err
	}

	if err := insertCategoriesAndQuestions(ctx, tx, id, categories); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	var summary QuizSummary
	qCount := 0
	for _, c := range categories {
		qCount += len(c.Questions)
	}
	_ = s.pool.QueryRow(ctx,
		`SELECT id, name, description, game_type, created_at FROM quizzes WHERE id = $1`, id,
	).Scan(&summary.ID, &summary.Name, &summary.Description, &summary.GameType, &summary.CreatedAt)
	summary.QuestionCount = qCount
	return &summary, nil
}

func (s *QuizStore) Update(ctx context.Context, id, name, description string, categories []core.Category) (*QuizSummary, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx,
		`UPDATE quizzes SET name=$1, description=$2, updated_at=now() WHERE id=$3`,
		name, description, id,
	)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, fmt.Errorf("quiz not found")
	}

	if _, err := tx.Exec(ctx, `DELETE FROM quiz_categories WHERE quiz_id = $1`, id); err != nil {
		return nil, err
	}

	if err := insertCategoriesAndQuestions(ctx, tx, id, categories); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	var summary QuizSummary
	qCount := 0
	for _, c := range categories {
		qCount += len(c.Questions)
	}
	_ = s.pool.QueryRow(ctx,
		`SELECT id, name, description, game_type, created_at FROM quizzes WHERE id = $1`, id,
	).Scan(&summary.ID, &summary.Name, &summary.Description, &summary.GameType, &summary.CreatedAt)
	summary.QuestionCount = qCount
	return &summary, nil
}

func (s *QuizStore) Delete(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM quizzes WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("quiz not found")
	}
	return nil
}

func insertCategoriesAndQuestions(ctx context.Context, tx pgx.Tx, quizID string, categories []core.Category) error {
	catRows := make([][]any, 0, len(categories))
	for i, c := range categories {
		catRows = append(catRows, []any{c.ID, quizID, c.Name, i})
	}
	if len(catRows) > 0 {
		_, err := tx.CopyFrom(ctx,
			pgx.Identifier{"quiz_categories"},
			[]string{"id", "quiz_id", "name", "position"},
			pgx.CopyFromRows(catRows),
		)
		if err != nil {
			return err
		}
	}

	var qRows [][]any
	for i, c := range categories {
		for j, q := range c.Questions {
			qRows = append(qRows, []any{
				q.ID, c.ID, quizID,
				q.Points, q.Text, q.Answer,
				q.ImageURL, q.AudioURL, q.VideoURL,
				j*len(categories) + i,
			})
		}
	}
	if len(qRows) > 0 {
		_, err := tx.CopyFrom(ctx,
			pgx.Identifier{"quiz_questions"},
			[]string{"id", "category_id", "quiz_id", "points", "text", "answer", "image_url", "audio_url", "video_url", "position"},
			pgx.CopyFromRows(qRows),
		)
		if err != nil {
			return err
		}
	}
	return nil
}
