CREATE TABLE IF NOT EXISTS quizzes (
    id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    game_type   TEXT        NOT NULL DEFAULT 'jeopardy',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_categories (
    id       TEXT NOT NULL,
    quiz_id  TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    position INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (id, quiz_id)
);

CREATE TABLE IF NOT EXISTS quiz_questions (
    id          TEXT NOT NULL,
    category_id TEXT NOT NULL,
    quiz_id     TEXT NOT NULL,
    points      INT  NOT NULL,
    text        TEXT NOT NULL,
    answer      TEXT NOT NULL DEFAULT '',
    image_url   TEXT NOT NULL DEFAULT '',
    audio_url   TEXT NOT NULL DEFAULT '',
    video_url   TEXT NOT NULL DEFAULT '',
    position    INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (id, category_id, quiz_id),
    FOREIGN KEY (category_id, quiz_id) REFERENCES quiz_categories(id, quiz_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quiz_categories_quiz_id ON quiz_categories(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_category_quiz ON quiz_questions(category_id, quiz_id);
