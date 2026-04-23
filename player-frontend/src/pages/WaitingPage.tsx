import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';

export default function WaitingPage() {
  const navigate = useNavigate();
  const { phase, players, myPlayerName, roomCode, roomReset, clearRoomReset } = useGameStore();

  useEffect(() => {
    if (roomReset) { clearRoomReset(); navigate('/'); return; }
    if (phase === 'QUESTION_OPEN' || phase === 'ACTIVE_PLAYER_ANSWERING' || phase === 'BUZZER_PHASE') {
      navigate('/game');
    }
    if (phase === 'GAME_OVER') {
      navigate('/end');
    }
  }, [phase, roomReset, navigate, clearRoomReset]);

  if (!roomCode) {
    return <div className="page centered"><p>Kein Room. <a href="/">Zurück</a></p></div>;
  }

  const others = players.filter((p) => p.name !== myPlayerName && p.connected);

  return (
    <div className="page centered waiting-page">
      <div className="waiting-card">
        <div className="waiting-spinner" />
        <h2>Warte auf den Moderator…</h2>
        <p className="waiting-you">Du: <strong>{myPlayerName}</strong></p>

        {others.length > 0 && (
          <div className="waiting-players">
            <p className="waiting-players-label">Andere Spieler:</p>
            <ul>
              {others.map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
