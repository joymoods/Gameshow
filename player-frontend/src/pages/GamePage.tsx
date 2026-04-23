import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { buzz } from '../ws/socket';

const BACKEND = `http://${window.location.hostname}:8080`;

function mediaUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  return `${BACKEND}${url}`;
}

export default function GamePage() {
  const navigate = useNavigate();
  const {
    phase, board, players,
    myPlayerId, myPlayerName,
    activePlayerId, activePlayerName,
    currentQuestion,
    buzzerOpen, hasBuzzed,
    buzzedPlayerId, buzzedPlayerName,
    roomReset, clearRoomReset,
  } = useGameStore();

  useEffect(() => {
    if (roomReset) { clearRoomReset(); navigate('/'); return; }
    if (phase === 'LOBBY') navigate('/waiting');
    if (phase === 'GAME_OVER') navigate('/end');
  }, [phase, roomReset, navigate, clearRoomReset]);

  const myScore = players.find((p) => p.id === myPlayerId)?.score ?? 0;
  const amActive = myPlayerId === activePlayerId;

  // Sort players by score descending for leaderboard
  const leaderboard = [...players].sort((a, b) => b.score - a.score);

  function handleBuzz() {
    if (!buzzerOpen || hasBuzzed) return;
    buzz();
  }

  return (
    <div className="game-page">
      {/* Top bar */}
      <header className="game-header">
        <span className="my-name">{myPlayerName}</span>
        <span className="my-score">{myScore} Pts</span>
      </header>

      {/* Active question */}
      {currentQuestion ? (
        <div className="question-display">
          <div className="question-meta">
            <span className="q-cat">{currentQuestion.category}</span>
            <span className="q-pts">{currentQuestion.points} Punkte</span>
          </div>
          <p className="q-text">{currentQuestion.text}</p>
          {mediaUrl(currentQuestion.imageUrl) && (
            <img src={mediaUrl(currentQuestion.imageUrl)} alt="" className="q-media-img" />
          )}
          {mediaUrl(currentQuestion.audioUrl) && (
            <audio src={mediaUrl(currentQuestion.audioUrl)} controls autoPlay className="q-media-audio" />
          )}
          {mediaUrl(currentQuestion.videoUrl) && (
            <video src={mediaUrl(currentQuestion.videoUrl)} controls autoPlay className="q-media-video" />
          )}
        </div>
      ) : (
        /* Board (read-only) */
        <div className="board-container">
          <div className="board-grid" style={{ gridTemplateColumns: `repeat(${board.length}, 1fr)` }}>
            {board.map((cat) => (
              <div key={cat.id} className="board-col">
                <div className="board-cat">{cat.name}</div>
                {cat.questions.map((q) => (
                  <div key={q.id} className={`board-cell ${q.played ? 'played' : ''}`}>
                    {q.played ? '' : q.points}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="status-bar">
        {phase === 'ACTIVE_PLAYER_ANSWERING' && (
          amActive
            ? <p className="status active-status">🎯 Du bist dran!</p>
            : <p className="status">{activePlayerName} antwortet…</p>
        )}
        {phase === 'BUZZER_PHASE' && buzzedPlayerId && (
          <p className="status">{buzzedPlayerName === myPlayerName ? '🔔 Du hast gebuzzert!' : `🔔 ${buzzedPlayerName} hat gebuzzert`}</p>
        )}
        {phase === 'BUZZER_PHASE' && !buzzedPlayerId && !hasBuzzed && (
          <p className="status buzzer-hint">Buzzer drücken!</p>
        )}
      </div>

      {/* Buzzer button */}
      <div className="buzzer-container">
        <button
          className={`buzzer-btn ${buzzerOpen && !hasBuzzed ? 'buzzer-active' : 'buzzer-inactive'}`}
          onPointerDown={handleBuzz}
          disabled={!buzzerOpen || hasBuzzed}
        >
          {hasBuzzed ? 'Gebuzzert!' : 'BUZZ'}
        </button>
      </div>

      {/* Mini leaderboard */}
      <div className="mini-leaderboard">
        {leaderboard.map((p, i) => (
          <div key={p.id} className={`lb-row ${p.id === myPlayerId ? 'lb-me' : ''} ${!p.connected ? 'lb-offline' : ''}`}>
            <span className="lb-rank">#{i + 1}</span>
            <span className="lb-name">{p.name}</span>
            <span className="lb-score">{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
