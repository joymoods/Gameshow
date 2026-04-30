import { useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
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
      return <Navigate to="/" replace />;
  }
}
