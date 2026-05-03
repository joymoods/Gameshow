import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { connect } from './ws/socket';
import BuilderPage from './pages/games/jeopardy/BuilderPage';
import LobbyPage from './pages/LobbyPage';
import ControlPage from './pages/ControlPage';
import HomePage from './pages/HomePage';
import LibraryPage from './pages/LibraryPage';
import PinPage from './pages/PinPage';
import { useGameStore } from './store/gameStore';
import { useLobbyStore } from './store/lobbyStore';
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

const PAGE_TITLES: Record<string, string> = {
  '/': 'Spiele',
  '/builder/jeopardy': 'Quiz-Builder',
  '/library': 'Quiz-Bibliothek',
};

function Nav({ onEndGame }: { onEndGame?: () => void }) {
  const location = useLocation();
  const params = useParams<{ code?: string }>();
  const activeRoomCode = useLobbyStore((s) => s.activeRoomCode);

  const roomCode = params.code ?? activeRoomCode ?? '';

  const subtitle =
    PAGE_TITLES[location.pathname] ??
    (location.pathname.endsWith('/lobby') ? 'Lobby' :
     location.pathname.endsWith('/control') ? 'Control Panel' : '');

  const showRoom = !!roomCode && !['/', '/builder/jeopardy'].includes(location.pathname);

  return (
    <nav className="app-nav">
      <a className="nav-brand" href="/admin" style={{ textDecoration: 'none' }}>
        <span className="nav-brand-icon">⚡</span>
      </a>
      {subtitle && <span className="nav-subtitle">{subtitle}</span>}
      <div className="nav-spacer" />
      {showRoom && (
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

// ---- Route wrappers that need URL params ----

function ControlRoute({ toast }: { toast: (msg: string, type?: ToastType) => void }) {
  const { code } = useParams<{ code: string }>();
  const { resetGameState } = useGameStore();
  const navigate = useNavigate();

  async function handleEndGame() {
    try {
      await fetch(`${import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}`}/api/rooms/${code}/end`, {
        method: 'POST',
      });
    } catch { /* ignore */ }
    resetGameState();
    navigate('/');
  }

  return (
    <>
      <Nav onEndGame={handleEndGame} />
      <ControlPage toast={toast} />
    </>
  );
}

// ---- App shell ----

function AppShell() {
  const { toasts, add: toast } = useToasts();

  return (
    <div className="app-shell">
      <Routes>
        {/* New routes */}
        <Route
          path="/"
          element={
            <>
              <Nav />
              <HomePage toast={toast} />
            </>
          }
        />
        <Route
          path="/builder/jeopardy"
          element={
            <>
              <Nav />
              <BuilderPage toast={toast} />
            </>
          }
        />
        <Route
          path="/library"
          element={
            <>
              <Nav />
              <LibraryPage toast={toast} />
            </>
          }
        />
        <Route
          path="/rooms/:code/lobby"
          element={
            <>
              <Nav />
              <LobbyPage toast={toast} />
            </>
          }
        />
        <Route
          path="/rooms/:code/control"
          element={<ControlRoute toast={toast} />}
        />

        {/* Legacy redirects – keep old bookmarks working */}
        <Route path="/lobby" element={<Navigate to="/" replace />} />
        <Route path="/control" element={<Navigate to="/" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts toasts={toasts} />
    </div>
  );
}

const REQUIRED_PIN = import.meta.env.VITE_ADMIN_PIN as string | undefined;

export default function App() {
  const [authed, setAuthed] = useState(
    !REQUIRED_PIN || sessionStorage.getItem('admin_auth') === '1'
  );

  useEffect(() => {
    if (authed) connect();
  }, [authed]);

  if (!authed) {
    return <PinPage onAuth={() => setAuthed(true)} />;
  }

  return (
    <BrowserRouter basename="/admin">
      <AppShell />
    </BrowserRouter>
  );
}
