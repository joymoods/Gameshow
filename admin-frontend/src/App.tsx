import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { connect } from './ws/socket';
import BuilderPage from './pages/BuilderPage';
import LobbyPage from './pages/LobbyPage';
import ControlPage from './pages/ControlPage';
import { useGameStore } from './store/gameStore';
import './App.css';

function ConnectionBadge() {
  const connected = useGameStore((s) => s.connected);
  return (
    <div className={`connection-badge ${connected ? 'online' : 'offline'}`}>
      {connected ? '● Online' : '○ Verbinde…'}
    </div>
  );
}

export default function App() {
  useEffect(() => {
    connect();
  }, []);

  return (
    <BrowserRouter>
      <ConnectionBadge />
      <Routes>
        <Route path="/" element={<BuilderPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/control" element={<ControlPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
