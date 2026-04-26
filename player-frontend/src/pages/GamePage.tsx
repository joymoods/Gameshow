import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import JeopardyGame from './games/jeopardy/JeopardyGame';

export default function GamePage() {
  const navigate = useNavigate();
  const { roomPhase, gameType, roomReset, clearRoomReset } = useGameStore();

  useEffect(() => {
    if (roomReset) { clearRoomReset(); navigate('/'); return; }
    if (!roomPhase) return;
    if (roomPhase === 'LOBBY') navigate('/waiting');
    if (roomPhase === 'GAME_OVER') navigate('/end');
  }, [roomPhase, roomReset, navigate, clearRoomReset]);

  switch (gameType) {
    case 'jeopardy':
      return <JeopardyGame />;
    default:
      return (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
          <p>Unbekannter Spieltyp: <strong>{gameType ?? '…'}</strong></p>
        </div>
      );
  }
}
