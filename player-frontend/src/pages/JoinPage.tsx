import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { connect } from '../ws/socket';
import { useGameStore } from '../store/gameStore';

export default function JoinPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const roomCode = code.trim().toUpperCase();
    const playerName = name.trim();
    if (!roomCode || !playerName) {
      setError('Bitte Room-Code und Name eingeben.');
      return;
    }

    setJoining(true);
    setError('');

    try {
      // Verify room exists before connecting
      const res = await fetch(`http://${window.location.hostname}:8080/api/rooms/${roomCode}`);
      if (!res.ok) {
        setError('Room nicht gefunden. Code prüfen.');
        return;
      }

      useGameStore.getState().setIdentity('', playerName);
      connect(roomCode, playerName);
      navigate('/waiting');
    } catch {
      setError('Verbindung fehlgeschlagen. Backend erreichbar?');
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="join-page">
      <div className="join-card">
        <h1 className="join-title">Jeopardy</h1>
        <p className="join-subtitle">Gib den Room-Code und deinen Namen ein</p>

        <form onSubmit={handleJoin} className="join-form">
          <input
            className="join-input code-input"
            type="text"
            placeholder="ROOM-CODE"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <input
            className="join-input"
            type="text"
            placeholder="Dein Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="off"
          />
          {error && <p className="join-error">{error}</p>}
          <button
            className="join-btn"
            type="submit"
            disabled={joining || !code || !name}
          >
            {joining ? 'Verbinde…' : 'Beitreten'}
          </button>
        </form>
      </div>
    </div>
  );
}
