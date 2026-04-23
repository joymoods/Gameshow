import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import type { Question } from '../types';

const API = `http://${window.location.hostname}:8080`;

// ---- Score editor row ----
function ScoreRow({ playerId, name, score, roomCode }: { playerId: string; name: string; score: number; roomCode: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(score));

  async function save() {
    const val = parseInt(draft, 10);
    if (isNaN(val)) return;
    await fetch(`${API}/api/rooms/${roomCode}/players/${playerId}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: val }),
    });
    setEditing(false);
  }

  return (
    <div className="score-row">
      <span className="score-name">{name}</span>
      {editing ? (
        <span className="score-edit">
          <input
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            autoFocus
            style={{ width: 80 }}
          />
          <button className="btn-primary btn-sm" onClick={save}>✓</button>
          <button className="btn-sm" onClick={() => setEditing(false)}>✕</button>
        </span>
      ) : (
        <span className="score-value" onClick={() => { setDraft(String(score)); setEditing(true); }}>
          {score} <span className="edit-hint">✏️</span>
        </span>
      )}
    </div>
  );
}

// ---- Main ----
export default function ControlPage() {
  const navigate = useNavigate();
  const {
    roomCode, board, players, playerOrder,
    activePlayerId, activePlayerName,
    currentQuestion, phase,
    buzzedPlayerId, buzzedPlayerName,
    finalScores,
    resetGameState,
  } = useGameStore();

  const [answering, setAnswering] = useState(false);

  const orderedPlayers = playerOrder
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean) as typeof players;

  // Determine who to judge — buzzed player takes priority over active player
  const judgingPlayerId = buzzedPlayerId ?? activePlayerId;
  const judgingPlayerName = buzzedPlayerName ?? activePlayerName;

  async function openQuestion(q: Question) {
    if (q.played) return;
    await fetch(`${API}/api/rooms/${roomCode}/question/${q.id}/open`, { method: 'POST' });
  }

  async function judgeAnswer(correct: boolean) {
    if (!judgingPlayerId || !currentQuestion) return;
    setAnswering(true);
    try {
      await fetch(`${API}/api/rooms/${roomCode}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: judgingPlayerId, correct }),
      });
    } finally {
      setAnswering(false);
    }
  }

  async function endGame() {
    if (!confirm('Spiel wirklich beenden?')) return;
    await fetch(`${API}/api/rooms/${roomCode}/end`, { method: 'POST' });
  }

  if (!roomCode) {
    return <div className="page"><p>Kein aktiver Room. <a href="/">Zurück</a></p></div>;
  }

  // Game over screen
  if (phase === 'GAME_OVER') {
    const scores = finalScores.length > 0 ? finalScores : players;
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    return (
      <div className="page gameover-page">
        <h1>🏆 Spiel vorbei!</h1>
        <ol className="final-scores">
          {sorted.map((p, i) => (
            <li key={p.id} className={i === 0 ? 'winner' : ''}>
              <span className="rank">#{i + 1}</span>
              <span className="name">{p.name}</span>
              <span className="score">{p.score} Punkte</span>
            </li>
          ))}
        </ol>
        <button className="btn-primary" onClick={() => { resetGameState(); navigate('/'); }}>Neues Spiel</button>
      </div>
    );
  }

  return (
    <div className="page control-page">
      <header className="page-header">
        <h1>Control Panel <span className="room-badge">{roomCode}</span></h1>
        <button className="btn-danger btn-sm" onClick={endGame}>Spiel beenden</button>
      </header>

      <div className="control-layout">
        {/* Left: Board */}
        <section className="board-section">
          <h2>Board</h2>
          <div className="board-grid" style={{ gridTemplateColumns: `repeat(${board.length}, 1fr)` }}>
            {board.map((cat) => (
              <div key={cat.id} className="board-column">
                <div className="board-category">{cat.name}</div>
                {cat.questions.map((q) => (
                  <button
                    key={q.id}
                    className={`board-cell ${q.played ? 'played' : ''} ${currentQuestion?.questionId === q.id ? 'active' : ''}`}
                    onClick={() => openQuestion(q)}
                    disabled={q.played || !!currentQuestion}
                  >
                    {q.played ? '' : q.points}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* Right: Game state */}
        <aside className="control-sidebar">
          {/* Active question */}
          {currentQuestion && (
            <div className="question-panel">
              <div className="question-meta">
                <span className="q-category">{currentQuestion.category}</span>
                <span className="q-points">{currentQuestion.points} Punkte</span>
              </div>
              <p className="q-text">{currentQuestion.text}</p>
              {currentQuestion.imageUrl && <img src={currentQuestion.imageUrl} alt="" className="q-media" />}
              {currentQuestion.audioUrl && <audio src={currentQuestion.audioUrl} controls className="q-media" />}
              {currentQuestion.videoUrl && <video src={currentQuestion.videoUrl} controls className="q-media" />}
            </div>
          )}

          {/* Current player / phase info */}
          <div className="phase-panel">
            <div className="phase-badge">{phase.replace('_', ' ')}</div>

            {phase === 'ACTIVE_PLAYER_ANSWERING' && activePlayerName && (
              <p className="active-player-info">🎯 Dran: <strong>{activePlayerName}</strong></p>
            )}

            {phase === 'BUZZER_PHASE' && (
              <div className="buzzer-info">
                {buzzedPlayerName
                  ? <p>🔔 Gebuzzert: <strong>{buzzedPlayerName}</strong></p>
                  : <p>⏳ Warte auf Buzzer…</p>
                }
              </div>
            )}

            {/* Judge buttons */}
            {currentQuestion && judgingPlayerId && (phase === 'ACTIVE_PLAYER_ANSWERING' || (phase === 'BUZZER_PHASE' && buzzedPlayerId)) && (
              <div className="judge-buttons">
                <p className="judging-label">Antwort von <strong>{judgingPlayerName}</strong>:</p>
                <button
                  className="btn-correct"
                  onClick={() => judgeAnswer(true)}
                  disabled={answering}
                >
                  ✓ Richtig
                </button>
                <button
                  className="btn-wrong"
                  onClick={() => judgeAnswer(false)}
                  disabled={answering}
                >
                  ✗ Falsch
                </button>
              </div>
            )}
          </div>

          {/* Scores */}
          <div className="scores-panel">
            <h3>Scores</h3>
            {orderedPlayers.map((p) => (
              <ScoreRow
                key={p.id}
                playerId={p.id}
                name={p.name}
                score={p.score}
                roomCode={roomCode}
              />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
