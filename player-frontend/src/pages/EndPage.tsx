import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { disconnect } from '../ws/socket';

export default function EndPage() {
  const navigate = useNavigate();
  const { finalScores, players, myPlayerId } = useGameStore();

  const scores = finalScores.length > 0 ? finalScores : players;
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  function handleNewGame() {
    disconnect();
    useGameStore.setState({
      roomCode: '', phase: 'LOBBY', board: [], players: [],
      playerOrder: [], activePlayerId: null, activePlayerName: null,
      currentQuestion: null, buzzerOpen: false, hasBuzzed: false,
      buzzedPlayerId: null, buzzedPlayerName: null, finalScores: [],
      myPlayerId: '', myPlayerName: '',
    });
    navigate('/');
  }

  return (
    <div className="end-page">
      <div className="end-card">
        <div className="trophy">🏆</div>
        <h1 className="end-title">Spiel vorbei!</h1>

        {winner && (
          <p className="winner-announce">
            Gewinner: <strong>{winner.name}</strong> mit {winner.score} Punkten
          </p>
        )}

        <ol className="end-scores">
          {sorted.map((p, i) => (
            <li
              key={p.id}
              className={`end-score-row ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''} ${p.id === myPlayerId ? 'is-me' : ''}`}
            >
              <span className="end-rank">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
              </span>
              <span className="end-name">{p.name}</span>
              <span className="end-score">{p.score}</span>
            </li>
          ))}
        </ol>

        <button className="join-btn" onClick={handleNewGame}>
          Neues Spiel
        </button>
      </div>
    </div>
  );
}
