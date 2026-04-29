import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLobbyStore } from '../store/lobbyStore';
import type { GameType, RoomInfo } from '../types';
import type { ToastType } from '../App';
import brainstormLogo from '../assets/brainstorm-logo.png';

const API = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}`;

const GAME_TYPES: { id: GameType; logo?: string; icon?: string; description: string }[] = [
  {
    id: 'jeopardy',
    logo: brainstormLogo,
    description: 'Kategorien & Punktewerte – wer kennt die Antwort?',
  },
];

const PHASE_LABELS: Record<string, string> = {
  LOBBY: 'Lobby',
  IN_PROGRESS: 'Läuft',
  GAME_OVER: 'Beendet',
};

interface Props {
  toast: (msg: string, type?: ToastType) => void;
}

export default function HomePage({ toast }: Props) {
  const navigate = useNavigate();
  const { rooms, fetchRooms, setActiveRoom } = useLobbyStore();
  const [creating, setCreating] = useState<GameType | null>(null);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  async function startGame(gameType: GameType) {
    if (creating) return;
    setCreating(gameType);
    try {
      const res = await fetch(`${API}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_type: gameType }),
      });
      if (!res.ok) throw new Error('Room erstellen fehlgeschlagen');
      const { code } = await res.json();
      setActiveRoom(code);
      navigate(`/rooms/${code}/lobby`);
    } catch (e) {
      toast(String(e), 'error');
    } finally {
      setCreating(null);
    }
  }

  function openRoom(room: RoomInfo) {
    setActiveRoom(room.roomCode);
    if (room.room_phase === 'IN_PROGRESS') {
      navigate(`/rooms/${room.roomCode}/control`);
    } else {
      navigate(`/rooms/${room.roomCode}/lobby`);
    }
  }

  async function closeRoom(e: React.MouseEvent, code: string) {
    e.stopPropagation();
    if (!confirm(`Raum ${code} wirklich schließen?`)) return;
    try {
      await fetch(`${API}/api/rooms/${code}`, { method: 'DELETE' });
      fetchRooms();
    } catch {
      toast('Raum konnte nicht geschlossen werden', 'error');
    }
  }

  const activeRooms = rooms.filter((r) => r.room_phase !== 'GAME_OVER');

  return (
    <div className="home-page">
      <div className="game-select-section">
        <div className="game-select-header">
          <h1 className="game-select-title">Spiel auswählen</h1>
          <p className="game-select-subtitle">Wähle ein Spielformat und starte sofort eine neue Session.</p>
        </div>

        <div className="game-type-grid">
          {GAME_TYPES.map((g) => (
            <button
              key={g.id}
              className={`game-type-card ${creating === g.id ? 'loading' : ''}`}
              onClick={() => startGame(g.id)}
              disabled={!!creating}
            >
              {g.logo
                ? <img src={g.logo} alt={g.id} className="game-type-card-logo" />
                : <span className="game-type-card-icon">{g.icon}</span>
              }
              <span className="game-type-card-desc">{g.description}</span>
              {creating === g.id && <span className="game-type-card-spinner" />}
            </button>
          ))}
        </div>

        <div className="game-select-tools">
          <button className="btn-ghost btn-sm" onClick={() => navigate('/builder/jeopardy')}>
            Quiz-Builder
          </button>
          <button className="btn-ghost btn-sm" onClick={() => navigate('/library')}>
            Bibliothek
          </button>
        </div>
      </div>

      {activeRooms.length > 0 && (
        <div className="active-rooms-section">
          <div className="active-rooms-header">
            <span className="active-rooms-label">AKTIVE SESSIONS</span>
            <span className="active-rooms-count">{activeRooms.length}</span>
          </div>
          <div className="active-rooms-list">
            {activeRooms.map((room) => (
              <div key={room.roomCode} className="active-room-row">
                <button className="active-room-btn" onClick={() => openRoom(room)}>
                  <span className="active-room-code">{room.roomCode}</span>
                  <span className={`active-room-phase phase-${String(room.room_phase).toLowerCase()}`}>
                    {PHASE_LABELS[room.room_phase as string] ?? room.room_phase}
                  </span>
                  <span className="active-room-players">{(room.scores?.length ?? 0)} Spieler</span>
                </button>
                <button
                  className="active-room-close"
                  onClick={(e) => closeRoom(e, room.roomCode)}
                  title="Raum schließen"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
