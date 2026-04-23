// ---- Domain types ----

export interface Question {
  id: string;
  categoryId: string;
  points: number;
  text: string;
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  played: boolean;
}

export interface Category {
  id: string;
  name: string;
  questions: Question[];
}

export interface Player {
  id: string;
  name: string;
  score: number;
  connected: boolean;
}

export type GamePhase =
  | 'LOBBY'
  | 'QUESTION_OPEN'
  | 'ACTIVE_PLAYER_ANSWERING'
  | 'BUZZER_PHASE'
  | 'QUESTION_DONE'
  | 'GAME_OVER';

// ---- WebSocket message types ----

export interface WsMessage<T = unknown> {
  type: string;
  payload: T;
}

// Outgoing (Client → Server)
export interface JoinGamePayload {
  roomCode: string;
  playerName: string;
}

// Incoming (Server → Client)
export interface GameStatePayload {
  roomCode: string;
  board: Category[];
  scores: Player[];
  activePlayers: string[];
  currentPhase: GamePhase;
}

export interface QuestionOpenedPayload {
  questionId: string;
  category: string;
  points: number;
  text: string;
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
}

export interface ActivePlayerPayload {
  playerId: string;
  playerName: string;
}

export interface PlayerBuzzedPayload {
  playerId: string;
  playerName: string;
}

export interface AnswerResultPayload {
  playerId: string;
  correct: boolean;
  pointsDelta: number;
  newScore: number;
}

export interface BoardUpdatePayload {
  questionId: string;
  played: boolean;
}

export interface GameOverPayload {
  finalScores: Player[];
}

export interface PlayerJoinedPayload {
  playerId: string;
  playerName: string;
}

export interface PlayerLeftPayload {
  playerId: string;
}

export interface ErrorPayload {
  message: string;
}

// Message type constants
export const MSG = {
  GAME_STATE: 'GAME_STATE',
  QUESTION_OPENED: 'QUESTION_OPENED',
  ACTIVE_PLAYER: 'ACTIVE_PLAYER',
  BUZZER_OPEN: 'BUZZER_OPEN',
  PLAYER_BUZZED: 'PLAYER_BUZZED',
  ANSWER_RESULT: 'ANSWER_RESULT',
  ANSWER_REVEALED: 'ANSWER_REVEALED',
  BOARD_UPDATE: 'BOARD_UPDATE',
  GAME_OVER: 'GAME_OVER',
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_LEFT: 'PLAYER_LEFT',
  ERROR: 'ERROR',
  ROOM_RESET: 'ROOM_RESET',
} as const;
