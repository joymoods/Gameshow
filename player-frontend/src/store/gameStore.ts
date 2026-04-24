import { create } from 'zustand';
import {
  MSG,
  type Category,
  type GamePhase,
  type Player,
  type QuestionOpenedPayload,
  type WsMessage,
} from '../types';

interface ActiveQuestion extends QuestionOpenedPayload {}

interface GameState {
  // Connection
  connected: boolean;

  // Identity
  myPlayerId: string;
  myPlayerName: string;

  // Room
  roomCode: string;
  phase: GamePhase;

  // Board
  board: Category[];

  // Players / scores
  players: Player[];
  playerOrder: string[];

  // Active game
  activePlayerId: string | null;
  activePlayerName: string | null;
  currentQuestion: ActiveQuestion | null;

  // Buzzer state
  buzzerOpen: boolean;
  hasBuzzed: boolean;
  buzzedPlayerId: string | null;
  buzzedPlayerName: string | null;

  // End
  finalScores: Player[];

  // Revealed answer (broadcast by admin)
  revealedAnswer: string | null;

  // Last answer judgment (correct/wrong)
  lastAnswerResult: { playerId: string; correct: boolean } | null;

  // Room was replaced by admin — player must rejoin
  roomReset: boolean;

  // Actions
  setConnected: (v: boolean) => void;
  setIdentity: (id: string, name: string) => void;
  handleMessage: (msg: WsMessage) => void;
  clearRoomReset: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  connected: false,
  myPlayerId: '',
  myPlayerName: '',
  roomCode: '',
  phase: 'LOBBY',
  board: [],
  players: [],
  playerOrder: [],
  activePlayerId: null,
  activePlayerName: null,
  currentQuestion: null,
  buzzerOpen: false,
  hasBuzzed: false,
  buzzedPlayerId: null,
  buzzedPlayerName: null,
  finalScores: [],
  revealedAnswer: null,
  lastAnswerResult: null,
  roomReset: false,

  setConnected: (connected) => set({ connected }),

  setIdentity: (myPlayerId, myPlayerName) => set({ myPlayerId, myPlayerName }),

  clearRoomReset: () => set({ roomReset: false }),

  handleMessage: (msg) => {
    switch (msg.type) {
      case MSG.GAME_STATE: {
        const p = msg.payload as {
          roomCode: string;
          board: Category[];
          scores: Player[];
          activePlayers: string[];
          currentPhase: GamePhase;
        };
        set((state) => {
          // Resolve own player ID by matching name — only needed once after join
          let myPlayerId = state.myPlayerId;
          if (!myPlayerId && state.myPlayerName) {
            const me = p.scores.find(
              (pl) => pl.name.toLowerCase() === state.myPlayerName.toLowerCase()
            );
            if (me) myPlayerId = me.id;
          }
          return {
            roomCode: p.roomCode,
            board: p.board,
            players: p.scores,
            playerOrder: p.activePlayers,
            phase: p.currentPhase,
            myPlayerId,
          };
        });
        break;
      }

      case MSG.QUESTION_OPENED: {
        const p = msg.payload as ActiveQuestion;
        set({
          currentQuestion: p,
          buzzerOpen: false,
          hasBuzzed: false,
          buzzedPlayerId: null,
          buzzedPlayerName: null,
          revealedAnswer: null,
          lastAnswerResult: null,
        });
        break;
      }

      case MSG.ACTIVE_PLAYER: {
        const p = msg.payload as { playerId: string; playerName: string };
        set({ activePlayerId: p.playerId, activePlayerName: p.playerName });
        break;
      }

      case MSG.BUZZER_OPEN: {
        // Enable buzzer only if this player hasn't already buzzed this question
        // AND is not the active player (who triggered the buzzer phase by answering wrong).
        // hasBuzzed is reset on QUESTION_OPENED, not here — so players who
        // already had their chance stay locked out on buzzer re-opens.
        const { hasBuzzed, myPlayerId, activePlayerId } = get();
        set({
          buzzerOpen: !hasBuzzed && myPlayerId !== activePlayerId,
          buzzedPlayerId: null,
          buzzedPlayerName: null,
        });
        break;
      }

      case MSG.PLAYER_BUZZED: {
        const p = msg.payload as { playerId: string; playerName: string };
        set({
          buzzerOpen: false,
          buzzedPlayerId: p.playerId,
          buzzedPlayerName: p.playerName,
        });
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
          buzzerOpen: false,
          lastAnswerResult: { playerId: p.playerId, correct: p.correct },
        }));
        break;
      }

      case MSG.ANSWER_REVEALED: {
        const p = msg.payload as { answer: string };
        set({ revealedAnswer: p.answer });
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
          buzzerOpen: false,
          hasBuzzed: false,
          revealedAnswer: null,
        }));
        break;
      }

      case MSG.GAME_OVER: {
        const p = msg.payload as { finalScores: Player[] };
        set({ phase: 'GAME_OVER', finalScores: p.finalScores, buzzerOpen: false });
        break;
      }

      case MSG.ERROR: {
        const p = msg.payload as { message: string };
        console.error('WS Error:', p.message);
        break;
      }

      case MSG.ROOM_RESET: {
        // Admin started a new session — clear state and send player back to join
        set({
          roomReset: true,
          roomCode: '', phase: 'LOBBY', board: [], players: [],
          playerOrder: [], activePlayerId: null, activePlayerName: null,
          currentQuestion: null, buzzerOpen: false, hasBuzzed: false,
          buzzedPlayerId: null, buzzedPlayerName: null, finalScores: [],
          myPlayerId: '', myPlayerName: '',
        });
        break;
      }
    }
  },
}));
