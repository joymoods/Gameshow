import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { disconnect } from '../ws/socket';

export default function EndPage() {
  const navigate = useNavigate();
  const { finalScores, players, myPlayerId } = useGameStore();

  const scores = finalScores.length > 0 ? finalScores : players;
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const myRank = sorted.findIndex((p) => p.id === myPlayerId) + 1;

  function handleNewGame() {
    disconnect();
    useGameStore.setState({
      roomCode: '', phase: 'LOBBY', gameType: null, roomPhase: null,
      board: [], players: [],
      playerOrder: [], activePlayerId: null, activePlayerName: null,
      currentQuestion: null, buzzerOpen: false, hasBuzzed: false,
      buzzedPlayerId: null, buzzedPlayerName: null, finalScores: [],
      myPlayerId: '', myPlayerName: '',
    });
    navigate('/');
  }

  return (
    <div className="end-page">
      <div className="end-trophy">🏆</div>
      <h1 className="end-title">Spiel vorbei!</h1>
      {myRank === 1 ? (
        <p className="end-rank-msg winner">Glückwunsch — du hast gewonnen!</p>
      ) : (
        <p className="end-rank-msg">
          Du hast Platz <strong>#{myRank}</strong> erreicht
        </p>
      )}

      <div className="end-scores">
        {sorted.map((p, i) => {
          const isMe = p.id === myPlayerId;
          return (
            <div
              key={p.id}
              className={`end-score-item ${i === 0 ? 'winner' : ''} ${isMe ? 'is-me' : ''}`}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <span className="end-rank">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
              </span>
              <div className={`end-avatar ${isMe ? 'is-me' : 'other'}`}>{p.name[0]}</div>
              <span className="end-name">{p.name}</span>
              {isMe && <span className="end-me-badge">du</span>}
              <span className={`end-score-value ${p.score < 0 ? 'negative' : 'positive'}`}>
                {p.score}<span className="end-score-unit">Pts</span>
              </span>
            </div>
          );
        })}
      </div>

      <button className="end-restart-btn" onClick={handleNewGame}>
        Neues Spiel
      </button>
    </div>
  );
}
