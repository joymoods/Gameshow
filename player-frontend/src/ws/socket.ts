import { useGameStore } from '../store/gameStore';
import type { WsMessage } from '../types';

const _apiBase = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}`;
const WS_URL = _apiBase.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/ws';

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let pendingJoin: { roomCode: string; playerName: string } | null = null;

export function connect(roomCode: string, playerName: string) {
  pendingJoin = { roomCode, playerName };

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    if (socket.readyState === WebSocket.OPEN) sendJoin();
    return;
  }

  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    reconnectDelay = 1000;
    useGameStore.getState().setConnected(true);
    sendJoin();
  };

  socket.onclose = () => {
    useGameStore.getState().setConnected(false);
    scheduleReconnect();
  };

  socket.onerror = () => {
    socket?.close();
  };

  socket.onmessage = (event) => {
    try {
      const msg: WsMessage = JSON.parse(event.data);
      useGameStore.getState().handleMessage(msg);
    } catch (e) {
      console.error('WS parse error', e);
    }
  };
}

function sendJoin() {
  if (!pendingJoin) return;
  send('JOIN_GAME', pendingJoin);
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    if (pendingJoin) connect(pendingJoin.roomCode, pendingJoin.playerName);
  }, reconnectDelay);
}

// No debounce, no delay — send immediately
export function send(type: string, payload: unknown = {}) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload }));
  }
}

export function buzz() {
  send('BUZZ', {});
  useGameStore.setState({ hasBuzzed: true, buzzerOpen: false });
}

export function disconnect() {
  pendingJoin = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
}
