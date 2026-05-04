import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { connect } from './ws/socket';
import BuilderPage from './pages/games/jeopardy/BuilderPage';
import LobbyPage from './pages/LobbyPage';
import ControlPage from './pages/ControlPage';
import HomePage from './pages/HomePage';
import LibraryPage from './pages/LibraryPage';
import LoginPage, { LOGIN_REQUIRED } from './pages/LoginPage';
import { useGameStore } from './store/gameStore';
import { useLobbyStore } from './store/lobbyStore';
import { API, apiFetch } from './api/client';
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

// ---- Auth helpers ----

const AUTH_KEY = 'admin_authed';

export function isAuthed(): boolean {
  // If no credentials are configured, login is not required
  if (!LOGIN_REQUIRED) return true;
  return localStorage.getItem(AUTH_KEY) === '1';
}

export function setAuthed() {
  localStorage.setItem(AUTH_KEY, '1');
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
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

// ---- Route wrappers ----

function ControlRoute({ toast }: { toast: (msg: string, type?: ToastType) => void }) {
  const { code } = useParams<{ code: string }>();
  const { resetGameState } = useGameStore();
  const navigate = useNavigate();

  async function handleEndGame() {
    try {
      await apiFetch(`${API}/api/rooms/${code}/end`, { method: 'POST' });
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ---- App shell ----

function AppShell() {
  const { toasts, add: toast } = useToasts();
  const navigate = useNavigate();

  useEffect(() => {
    connect();
  }, []);

  return (
    <div className="app-shell">
      <Routes>
        <Route
          path="/login"
          element={
            !LOGIN_REQUIRED || isAuthed()
              ? <Navigate to="/" replace />
              : <LoginPage onAuth={() => { setAuthed(); connect(); navigate('/'); }} />
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Nav />
              <HomePage toast={toast} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/builder/jeopardy"
          element={
            <ProtectedRoute>
              <Nav />
              <BuilderPage toast={toast} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/library"
          element={
            <ProtectedRoute>
              <Nav />
              <LibraryPage toast={toast} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rooms/:code/lobby"
          element={
            <ProtectedRoute>
              <Nav />
              <LobbyPage toast={toast} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rooms/:code/control"
          element={
            <ProtectedRoute>
              <ControlRoute toast={toast} />
            </ProtectedRoute>
          }
        />

        <Route path="/lobby" element={<Navigate to="/" replace />} />
        <Route path="/control" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts toasts={toasts} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <AppShell />
    </BrowserRouter>
  );
}
