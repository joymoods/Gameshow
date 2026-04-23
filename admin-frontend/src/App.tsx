import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { connect } from './ws/socket';
import BuilderPage from './pages/BuilderPage';
import LobbyPage from './pages/LobbyPage';
import ControlPage from './pages/ControlPage';
import { useGameStore } from './store/gameStore';
import './App.css';

// ---- Toast system ----

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  msg: string;
  type: ToastType;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const add = useCallback((msg: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return { toasts, add };
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ---- Nav ----

function Nav({ onEndGame }: { onEndGame?: () => void }) {
  const location = useLocation();
  const roomCode = useGameStore((s) => s.roomCode);

  const subtitles: Record<string, string> = {
    '/': 'Quiz-Builder',
    '/lobby': 'Lobby',
    '/control': 'Control Panel',
  };
  const subtitle = subtitles[location.pathname] ?? '';
  const showRoom = location.pathname !== '/';

  return (
    <nav className="app-nav">
      <div className="nav-brand">
        <span className="nav-brand-icon">⚡</span>
        BrainStorm
      </div>
      {subtitle && <span className="nav-subtitle">{subtitle}</span>}
      <div className="nav-spacer" />
      {showRoom && roomCode && (
        <div className="nav-room">
          <span className="nav-room-label">ROOM</span>
          <span className="nav-room-code">{roomCode}</span>
        </div>
      )}
      {onEndGame && (
        <button className="nav-end-btn" onClick={onEndGame}>
          Spiel beenden
        </button>
      )}
    </nav>
  );
}

// ---- App shell ----

function AppShell() {
  const { toasts, add: toast } = useToasts();
  const { resetGameState } = useGameStore();

  function handleEndGame() {
    if (!confirm('Spiel wirklich beenden?')) return;
    const roomCode = useGameStore.getState().roomCode;
    fetch(`http://${window.location.hostname}:8080/api/rooms/${roomCode}/end`, {
      method: 'POST',
    }).catch(() => {});
    resetGameState();
    window.location.href = '/';
  }

  return (
    <div className="app-shell">
      <Routes>
        <Route
          path="/control"
          element={
            <>
              <Nav onEndGame={handleEndGame} />
              <ControlPage toast={toast} />
            </>
          }
        />
        <Route
          path="/lobby"
          element={
            <>
              <Nav />
              <LobbyPage toast={toast} />
            </>
          }
        />
        <Route
          path="/"
          element={
            <>
              <Nav />
              <BuilderPage toast={toast} />
            </>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts toasts={toasts} />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    connect();
  }, []);

  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
