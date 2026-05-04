// ---- Enum types ----

export type GameType = 'jeopardy';

export type RoomPhase = 'LOBBY' | 'IN_PROGRESS' | 'GAME_OVER';

// ---- Domain types ----

export interface Question {
  id: string;
  categoryId: string;
  points: number;
  text: string;
  answer?: string;
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
  // Phase 3 additions (additive – backends before Phase 3 omit these)
  game_type?: GameType;
  room_phase?: RoomPhase;
  game_state?: Record<string, unknown>;
}

export interface GameSwitchedPayload {
  game_type: GameType;
}

// Snapshot shape returned by GET /api/rooms and GET /api/rooms/:code
export interface RoomInfo {
  roomCode: string;
  game_type: GameType | string;
  room_phase: RoomPhase | string;
  scores: Player[];
  activePlayers: string[];
  currentPhase: string;
}

export interface QuestionOpenedPayload {
  questionId: string;
  category: string;
  points: number;
  text: string;
  answer?: string;
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
  GAME_SWITCHED: 'GAME_SWITCHED',
  QUESTION_OPENED: 'QUESTION_OPENED',
  ACTIVE_PLAYER: 'ACTIVE_PLAYER',
  BUZZER_OPEN: 'BUZZER_OPEN',
  PLAYER_BUZZED: 'PLAYER_BUZZED',
  ANSWER_RESULT: 'ANSWER_RESULT',
  BOARD_UPDATE: 'BOARD_UPDATE',
  ANSWER_REVEALED: 'ANSWER_REVEALED',
  GAME_OVER: 'GAME_OVER',
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_LEFT: 'PLAYER_LEFT',
  ERROR: 'ERROR',
  TIMER_STARTED: 'TIMER_STARTED',
  TIMER_STOPPED: 'TIMER_STOPPED',
  MEDIA_PLAY: 'MEDIA_PLAY',
  MEDIA_PAUSE: 'MEDIA_PAUSE',
} as const;
