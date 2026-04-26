import { create } from 'zustand';
import {
  MSG,
  type Category,
  type GamePhase,
  type GameType,
  type Player,
  type QuestionOpenedPayload,
  type RoomPhase,
  type WsMessage,
} from '../types';

interface ActiveQuestion {
  questionId: string;
  category: string;
  points: number;
  text: string;
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
}

interface GameState {
  // Connection
  connected: boolean;

  // Room
  roomCode: string;
  phase: GamePhase;
  gameType: GameType | null;
  roomPhase: RoomPhase | null;

  // Quiz / Board
  board: Category[];
  builderCategories: Category[]; // local draft before uploading

  // Players
  players: Player[];
  playerOrder: string[]; // IDs in turn order

  // Active game state
  activePlayerId: string | null;
  activePlayerName: string | null;
  currentQuestion: ActiveQuestion | null;
  buzzedPlayerId: string | null;
  buzzedPlayerName: string | null;
  finalScores: Player[];

  // Actions
  setConnected: (v: boolean) => void;
  handleMessage: (msg: WsMessage) => void;
  setBuilderCategories: (cats: Category[]) => void;
  resetGameState: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  connected: false,
  roomCode: '',
  phase: 'LOBBY',
  gameType: null,
  roomPhase: null,
  board: [],
  builderCategories: [],
  players: [],
  playerOrder: [],
  activePlayerId: null,
  activePlayerName: null,
  currentQuestion: null,
  buzzedPlayerId: null,
  buzzedPlayerName: null,
  finalScores: [],

  setConnected: (connected) => set({ connected }),

  setBuilderCategories: (builderCategories) => set({ builderCategories }),

  resetGameState: () => set({
    roomCode: '',
    phase: 'LOBBY',
    gameType: null,
    roomPhase: null,
    board: [],
    players: [],
    playerOrder: [],
    activePlayerId: null,
    activePlayerName: null,
    currentQuestion: null,
    buzzedPlayerId: null,
    buzzedPlayerName: null,
    finalScores: [],
  }),

  handleMessage: (msg) => {
    switch (msg.type) {
      case MSG.GAME_STATE: {
        const p = msg.payload as {
          roomCode: string;
          board: Category[];
          scores: Player[];
          activePlayers: string[];
          currentPhase: GamePhase;
          game_type?: GameType;
          room_phase?: RoomPhase;
        };
        set({
          roomCode: p.roomCode,
          board: p.board ?? [],
          players: p.scores ?? [],
          playerOrder: p.activePlayers ?? [],
          phase: p.currentPhase,
          gameType: p.game_type ?? null,
          roomPhase: p.room_phase ?? null,
        });
        break;
      }

      case MSG.GAME_SWITCHED: {
        const p = msg.payload as { game_type: GameType };
        set({ gameType: p.game_type });
        break;
      }

      case MSG.QUESTION_OPENED: {
        const p = msg.payload as QuestionOpenedPayload;
        set({
          currentQuestion: p,
          phase: 'ACTIVE_PLAYER_ANSWERING',
          buzzedPlayerId: null,
          buzzedPlayerName: null,
        });
        break;
      }

      case MSG.ACTIVE_PLAYER: {
        const p = msg.payload as { playerId: string; playerName: string };
        set({ activePlayerId: p.playerId, activePlayerName: p.playerName });
        break;
      }

      case MSG.BUZZER_OPEN: {
        set({ phase: 'BUZZER_PHASE', buzzedPlayerId: null, buzzedPlayerName: null });
        break;
      }

      case MSG.PLAYER_BUZZED: {
        const p = msg.payload as { playerId: string; playerName: string };
        set({ buzzedPlayerId: p.playerId, buzzedPlayerName: p.playerName });
        break;
      }

      case MSG.ANSWER_RESULT: {
        const p = msg.payload as {
          playerId: string;
          correct: boolean;
          pointsDelta: number;
          newScore: number;
        };
        set((state) => ({
          players: state.players.map((pl) =>
            pl.id === p.playerId ? { ...pl, score: p.newScore } : pl
          ),
        }));
        break;
      }

      case MSG.BOARD_UPDATE: {
        const p = msg.payload as { questionId: string; played: boolean };
        set((state) => ({
          board: state.board.map((cat) => ({
            ...cat,
            questions: cat.questions.map((q) =>
              q.id === p.questionId ? { ...q, played: p.played } : q
            ),
          })),
          currentQuestion: null,
          phase: 'QUESTION_OPEN',
          buzzedPlayerId: null,
          buzzedPlayerName: null,
        }));
        break;
      }

      case MSG.GAME_OVER: {
        const p = msg.payload as { finalScores: Player[] };
        set({ phase: 'GAME_OVER', finalScores: p.finalScores });
        break;
      }

      case MSG.PLAYER_JOINED: {
        const p = msg.payload as { playerId: string; playerName: string };
        set((state) => {
          if (state.players.find((pl) => pl.id === p.playerId)) return {};
          return {
            players: [
              ...state.players,
              { id: p.playerId, name: p.playerName, score: 0, connected: true },
            ],
            playerOrder: [...state.playerOrder, p.playerId],
          };
        });
        break;
      }

      case MSG.PLAYER_LEFT: {
        const p = msg.payload as { playerId: string };
        set((state) => ({
          players: state.players.map((pl) =>
            pl.id === p.playerId ? { ...pl, connected: false } : pl
          ),
        }));
        break;
      }

      case MSG.ERROR: {
        const p = msg.payload as { message: string };
        console.error('WS Error:', p.message);
        break;
      }
    }
  },
}));
