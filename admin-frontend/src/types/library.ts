export interface QuizSummary {
  id: string;
  name: string;
  description: string;
  game_type: string;
  created_at: string;
  question_count: number;
}

export interface LibraryQuestion {
  id: string;
  categoryId: string;
  points: number;
  text: string;
  answer: string;
  imageUrl: string;
  audioUrl: string;
  videoUrl: string;
}

export interface LibraryCategory {
  id: string;
  name: string;
  questions: LibraryQuestion[];
}

export interface QuizDetail extends QuizSummary {
  categories: LibraryCategory[];
}
