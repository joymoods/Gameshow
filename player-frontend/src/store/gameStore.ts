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
  gameType: GameType | null;
  roomPhase: RoomPhase | null;

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

  // Player was kicked by admin
  kicked: boolean;

  // Join failed (e.g. name already taken)
  joinError: string | null;

  // Timer
  timerEndsAt: number | null;
  timerDurMs: number | null;

  // Media sync (admin-controlled)
  mediaPlaying: boolean;
  mediaSeekTime: number | null;
  mediaSeekSeq: number;

  // Actions
  setConnected: (v: boolean) => void;
  setIdentity: (id: string, name: string) => void;
  handleMessage: (msg: WsMessage) => void;
  clearRoomReset: () => void;
  clearKicked: () => void;
  clearJoinError: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  connected: false,
  myPlayerId: '',
  myPlayerName: '',
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
  buzzerOpen: false,
  hasBuzzed: false,
  buzzedPlayerId: null,
  buzzedPlayerName: null,
  finalScores: [],
  revealedAnswer: null,
  lastAnswerResult: null,
  roomReset: false,
  kicked: false,
  joinError: null,
  timerEndsAt: null,
  timerDurMs: null,
  mediaPlaying: false,
  mediaSeekTime: null,
  mediaSeekSeq: 0,

  setConnected: (connected) => set({ connected }),

  setIdentity: (myPlayerId, myPlayerName) => set({ myPlayerId, myPlayerName }),

  clearRoomReset: () => set({ roomReset: false }),
  clearKicked: () => set({ kicked: false }),
  clearJoinError: () => set({ joinError: null }),

  handleMessage: (msg) => {
    switch (msg.type) {
      case MSG.GAME_STATE: {
        const p = msg.payload as {
          roomCode: string;
          board: Category[];
          scores: Player[];
          activePlayers: string[];
          currentPhase: GamePhase;
          game_type?: GameType | string;
          room_phase?: RoomPhase | string;
          game_state?: { timer_ends_at?: number; timer_dur_ms?: number };
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
          const timerEndsAt = p.game_state?.timer_ends_at ?? null;
          const timerDurMs = p.game_state?.timer_dur_ms ?? null;
          return {
            roomCode: p.roomCode,
            board: p.board,
            players: p.scores,
            playerOrder: p.activePlayers,
            phase: p.currentPhase,
            gameType: (p.game_type as GameType) ?? null,
            roomPhase: (p.room_phase as RoomPhase) ?? null,
            myPlayerId,
            timerEndsAt: timerEndsAt ? Number(timerEndsAt) : null,
            timerDurMs: timerDurMs ? Number(timerDurMs) : null,
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
          timerEndsAt: null,
          timerDurMs: null,
          mediaPlaying: false,
          mediaSeekTime: null,
          mediaSeekSeq: 0,
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
          timerEndsAt: null,
          timerDurMs: null,
        }));
        break;
      }

      case MSG.BOARD_COMPLETE: {
        set({
          phase: 'BOARD_COMPLETE',
          currentQuestion: null,
          buzzerOpen: false,
          hasBuzzed: false,
          buzzedPlayerId: null,
          buzzedPlayerName: null,
          timerEndsAt: null,
          timerDurMs: null,
          revealedAnswer: null,
        });
        break;
      }

      case MSG.GAME_OVER: {
        const p = msg.payload as { finalScores: Player[] };
        set({ phase: 'GAME_OVER', roomPhase: 'GAME_OVER', finalScores: p.finalScores, buzzerOpen: false });
        break;
      }

      case MSG.ERROR: {
        const p = msg.payload as { message: string };
        console.error('WS Error:', p.message);
        if (!get().myPlayerId) {
          set({ joinError: p.message });
        }
        break;
      }

      case MSG.GAME_SWITCHED: {
        const p = msg.payload as { game_type: GameType };
        set({ gameType: p.game_type });
        break;
      }

      case MSG.ROOM_RESET: {
        set({
          roomReset: true,
          roomCode: '', phase: 'LOBBY', gameType: null, roomPhase: null,
          board: [], players: [],
          playerOrder: [], activePlayerId: null, activePlayerName: null,
          currentQuestion: null, buzzerOpen: false, hasBuzzed: false,
          buzzedPlayerId: null, buzzedPlayerName: null, finalScores: [],
          myPlayerId: '', myPlayerName: '',
        });
        break;
      }

      case MSG.TIMER_STARTED: {
        const p = msg.payload as { endsAt: number; durationMs: number };
        set({ timerEndsAt: p.endsAt, timerDurMs: p.durationMs });
        break;
      }

      case MSG.TIMER_STOPPED: {
        set({ timerEndsAt: null, timerDurMs: null });
        break;
      }

      case MSG.MEDIA_PLAY: {
        set({ mediaPlaying: true });
        break;
      }

      case MSG.MEDIA_PAUSE: {
        set({ mediaPlaying: false });
        break;
      }

      case MSG.MEDIA_SEEK: {
        const p = msg.payload as { time: number };
        set({ mediaSeekTime: p.time, mediaSeekSeq: (get().mediaSeekSeq ?? 0) + 1 });
        break;
      }

      case 'KICKED': {
        set({
          kicked: true,
          roomCode: '', phase: 'LOBBY', gameType: null, roomPhase: null,
          board: [], players: [],
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
