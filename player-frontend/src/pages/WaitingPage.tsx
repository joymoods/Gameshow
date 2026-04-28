import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';

export default function WaitingPage() {
  const navigate = useNavigate();
  const { myPlayerName, myPlayerId, roomCode, players, roomPhase, roomReset, clearRoomReset } = useGameStore();

  useEffect(() => {
    if (roomReset) { clearRoomReset(); navigate('/'); return; }
    if (!roomPhase) return;
    if (roomPhase === 'IN_PROGRESS') navigate('/game');
    else if (roomPhase === 'GAME_OVER') navigate('/end');
  }, [roomPhase, roomReset, navigate, clearRoomReset]);

  if (!roomCode && !myPlayerName) {
    return (
      <div style={{ padding: 24 }}>
        <p>Kein aktiver Room. <Link to="/" style={{ color: 'var(--primary)' }}>Zurück</Link></p>
      </div>
    );
  }

  return (
    <div className="waiting-page">
      <div className="waiting-brand">
        <div className="waiting-brand-logo">
          <span className="waiting-brand-icon">⚡</span>BrainStorm
        </div>
        <div className="waiting-status">Warte auf den Moderator…</div>
        <div className="waiting-info">
          Als <strong>{myPlayerName}</strong> verbunden ·
          Room <strong className="waiting-room">{roomCode}</strong>
        </div>
      </div>

      {/* Animated connection indicator */}
      <div className="waiting-spinner-wrapper">
        <div className="waiting-ping" />
        <div className="waiting-spinner" />
      </div>

      {/* Player list */}
      <div className="waiting-players-card">
        <div className="waiting-players-header">
          <div className="waiting-players-label">SPIELER</div>
          <div className="waiting-players-count">{players.filter((p) => p.connected).length}/{players.length} verbunden</div>
        </div>
        <div className="waiting-player-list">
          {players.map((p) => {
            const isMe = p.id === myPlayerId;
            return (
              <div key={p.id} className={`waiting-player-item ${isMe ? 'is-me' : ''}`}>
                <div className={`waiting-player-avatar ${isMe ? 'is-me' : 'other'}`}>
                  {p.name[0]}
                </div>
                <span className={`waiting-player-name ${isMe ? 'is-me' : 'other'}`}>{p.name}</span>
                {isMe && <span className="waiting-me-label">du</span>}
                {p.connected && <span className="waiting-connected-dot" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
