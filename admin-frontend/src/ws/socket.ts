import { useGameStore } from '../store/gameStore';
import type { WsMessage } from '../types';

const WS_URL = `ws://${window.location.hostname}:8080/ws?role=admin`;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;

export function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    reconnectDelay = 1000;
    useGameStore.getState().setConnected(true);
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

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    connect();
  }, reconnectDelay);
}

export function send(type: string, payload: unknown = {}) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload }));
  }
}

export function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
}
