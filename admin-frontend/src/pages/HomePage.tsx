import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLobbyStore } from '../store/lobbyStore';
import type { GameType, RoomInfo } from '../types';
import type { ToastType } from '../App';

const API = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}`;

const PHASE_LABELS: Record<string, string> = {
  LOBBY: 'Lobby',
  IN_PROGRESS: 'Läuft',
  GAME_OVER: 'Beendet',
};

const GAME_TYPE_LABELS: Record<string, string> = {
  jeopardy: 'Jeopardy',
};

interface Props {
  toast: (msg: string, type?: ToastType) => void;
}

export default function HomePage({ toast }: Props) {
  const navigate = useNavigate();
  const { rooms, fetchRooms, setActiveRoom } = useLobbyStore();
  const [showModal, setShowModal] = useState(false);
  const [gameType, setGameType] = useState<GameType>('jeopardy');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  async function createRoom() {
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_type: gameType }),
      });
      if (!res.ok) throw new Error('Room erstellen fehlgeschlagen');
      const { code } = await res.json();
      setActiveRoom(code);
      setShowModal(false);
      navigate(`/rooms/${code}/lobby`);
    } catch (e) {
      toast(String(e), 'error');
    } finally {
      setCreating(false);
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

  return (
    <div className="home-page">
      <div className="home-header">
        <div>
          <h1 className="home-title">Lobbys</h1>
          <p className="home-subtitle">Wähle eine bestehende Lobby oder erstelle eine neue.</p>
        </div>
        <div className="home-header-actions">
          <button className="btn-secondary btn-sm" onClick={() => navigate('/builder/jeopardy')}>
            Quiz-Builder
          </button>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + Neue Lobby
          </button>
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className="empty-state">
          <p>Keine aktiven Lobbys vorhanden.</p>
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => setShowModal(true)}>
            Erste Lobby erstellen
          </button>
        </div>
      ) : (
        <div className="rooms-grid">
          {rooms.map((room) => (
            <div key={room.roomCode} className="room-card-wrapper">
              <button className="room-card" onClick={() => openRoom(room)}>
                <div className="room-card-code">{room.roomCode}</div>
                <div className="room-card-meta">
                  <span className="room-card-game">
                    {GAME_TYPE_LABELS[room.game_type as string] ?? room.game_type}
                  </span>
                  <span className={`room-card-phase phase-${String(room.room_phase).toLowerCase()}`}>
                    {PHASE_LABELS[room.room_phase as string] ?? room.room_phase}
                  </span>
                </div>
                <div className="room-card-players">
                  {(room.scores?.length ?? 0)} Spieler
                </div>
              </button>
              <button
                className="room-card-close"
                onClick={(e) => closeRoom(e, room.roomCode)}
                title="Raum schließen"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Neue Lobby erstellen</h2>
            <div className="form-group">
              <label className="form-label">Spiel-Typ</label>
              <select
                className="form-select"
                value={gameType}
                onChange={(e) => setGameType(e.target.value as GameType)}
              >
                <option value="jeopardy">Jeopardy</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>
                Abbrechen
              </button>
              <button className="btn-primary" onClick={createRoom} disabled={creating}>
                {creating ? 'Erstelle…' : 'Erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
