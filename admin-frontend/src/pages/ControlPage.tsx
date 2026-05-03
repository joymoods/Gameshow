import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import type { Question } from '../types';
import type { ToastType } from '../App';
import { useWebRTC } from '../hooks/useWebRTC';

const API = import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}`;

interface ScoreDelta {
  val: number;
  key: number;
}

interface Props {
  toast: (msg: string, type?: ToastType) => void;
}

// ---- Cam Tile ----

function CamTile({ stream, name, isSelf }: { stream: MediaStream | null; name: string; isSelf: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) {
    return (
      <div className="admin-cam-avatar">
        {name[0]?.toUpperCase() ?? '?'}
      </div>
    );
  }
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isSelf}
      className={`admin-cam-video${isSelf ? ' admin-cam-video--mirrored' : ''}`}
    />
  );
}

// ---- Score Row ----

function ScoreRow({
  playerId, name, score, roomCode, isActive, delta, camStream,
}: {
  playerId: string; name: string; score: number; roomCode: string; isActive: boolean; delta?: ScoreDelta; camStream?: MediaStream | null;
}) {
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
      <div className={`score-avatar ${isActive ? 'is-active' : 'not-active'}`}>
        {camStream !== undefined ? (
          <CamTile stream={camStream ?? null} name={name} isSelf={false} />
        ) : (
          name[0]
        )}
      </div>
      <span className={`score-name ${isActive ? 'is-active' : ''}`}>{name}</span>
      <div style={{ position: 'relative' }}>
        {delta && (
          <span key={delta.key} className={`score-delta ${delta.val > 0 ? 'is-positive' : 'is-negative'}`}>
            {delta.val > 0 ? '+' : ''}{delta.val}
          </span>
        )}
        {editing ? (
          <span className="score-edit">
            <input
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              autoFocus
            />
            <button className="btn-primary btn-sm" onClick={save}>✓</button>
            <button className="btn-secondary btn-sm" onClick={() => setEditing(false)}>✕</button>
          </span>
        ) : (
          <span
            className={`score-value ${score < 0 ? 'is-negative' : 'is-positive'}`}
            onClick={() => { setDraft(String(score)); setEditing(true); }}
            title="Klicken zum Bearbeiten"
          >
            {score}
          </span>
        )}
      </div>
    </div>
  );
}

// ---- Main ----

export default function ControlPage({ toast }: Props) {
  const navigate = useNavigate();
  const { code: urlCode } = useParams<{ code?: string }>();
  const {
    roomCode: storeRoomCode, board, players, playerOrder,
    activePlayerId, activePlayerName,
    currentQuestion, phase, roomPhase,
    buzzedPlayerId, buzzedPlayerName,
    finalScores, resetGameState, handleMessage,
  } = useGameStore();
  // Prefer URL param so the page works when navigated directly
  const roomCode = urlCode ?? storeRoomCode;

  const { camEnabled, activeCams, myStream, toggleCam } = useWebRTC('admin', 'Moderator');

  const [answering, setAnswering] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [answerBroadcast, setAnswerBroadcast] = useState(false);
  const [deltas, setDeltas] = useState<Record<string, ScoreDelta>>({});

  const orderedPlayers = playerOrder
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean) as typeof players;

  const judgingPlayerId = buzzedPlayerId ?? activePlayerId;
  const judgingPlayerName = buzzedPlayerName ?? activePlayerName;

  const totalQ = board.reduce((a, c) => a + c.questions.length, 0);
  const playedQ = board.reduce((a, c) => a + c.questions.filter((q) => q.played).length, 0);

  function flashDelta(pid: string, val: number) {
    const key = Date.now();
    setDeltas((d) => ({ ...d, [pid]: { val, key } }));
    setTimeout(() => setDeltas((d) => { const n = { ...d }; delete n[pid]; return n; }), 1800);
  }

  async function openQuestion(q: Question) {
    if (q.played) return;
    setShowAnswer(false);
    setAnswerBroadcast(false);
    await fetch(`${API}/api/rooms/${roomCode}/question/${q.id}/open`, { method: 'POST' });
  }

  async function closeQuestion() {
    await fetch(`${API}/api/rooms/${roomCode}/question/close`, { method: 'POST' });
    toast('Frage beendet', 'info');
  }

  async function revealAnswer() {
    await fetch(`${API}/api/rooms/${roomCode}/question/reveal`, { method: 'POST' });
    setAnswerBroadcast(true);
    toast('Lösung an Spieler gesendet', 'success');
  }

  async function endBuzzerPhase() {
    await fetch(`${API}/api/rooms/${roomCode}/question/end-buzzer`, { method: 'POST' });
    toast('Buzzer-Phase beendet', 'warning');
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
      const pts = currentQuestion.points;
      const isBuzzer = !!buzzedPlayerId;
      const delta = correct ? (isBuzzer ? Math.round(pts / 2) : pts) : (isBuzzer ? -Math.round(pts / 2) : -Math.round(pts / 2));
      flashDelta(judgingPlayerId, delta);
      toast(
        correct
          ? `✓ ${judgingPlayerName} +${Math.abs(delta)} Punkte${isBuzzer ? ' (½)' : ''}`
          : `✗ ${judgingPlayerName} ${delta} Punkte`,
        correct ? 'success' : 'error'
      );
    } finally {
      setAnswering(false);
    }
  }

  // Load current room state on mount so board is populated after page refresh
  useEffect(() => {
    if (!roomCode) return;
    fetch(`${API}/api/rooms/${roomCode}`)
      .then((r) => r.ok ? r.json() : null)
      .then((snap) => { if (snap) handleMessage({ type: 'GAME_STATE', payload: snap }); })
      .catch(() => {});
  }, [roomCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before leaving while game is running
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (roomPhase === 'IN_PROGRESS') { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [roomPhase]);

  // Keyboard shortcuts
  const judgeRef = useRef(judgeAnswer);
  judgeRef.current = judgeAnswer;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!currentQuestion || !judgingPlayerId) return;
      const canJudge = phase === 'ACTIVE_PLAYER_ANSWERING' || (phase === 'BUZZER_PHASE' && buzzedPlayerId);
      if (!canJudge) return;
      if (e.key === 'Enter') { e.preventDefault(); judgeRef.current(true); }
      if (e.key === 'Escape') { e.preventDefault(); judgeRef.current(false); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentQuestion, judgingPlayerId, phase, buzzedPlayerId]);

  if (!roomCode) {
    return (
      <div style={{ padding: 24 }}>
        <p>Kein aktiver Room. <a href="/admin" style={{ color: 'var(--primary)' }}>Zurück</a></p>
      </div>
    );
  }

  // Game over
  if (phase === 'GAME_OVER') {
    const scores = finalScores.length > 0 ? finalScores : players;
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    return (
      <div className="gameover-page">
        <div className="gameover-trophy">🏆</div>
        <h1>Spiel vorbei!</h1>
        <p className="gameover-subtitle">Herzlichen Glückwunsch an alle Teilnehmer</p>
        <ol className="final-scores">
          {sorted.map((p, i) => (
            <li key={p.id} className={`final-score-item ${i === 0 ? 'winner' : ''}`}>
              <span className="final-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
              <span className="final-name">{p.name}</span>
              <span className={`final-score-value ${p.score < 0 ? 'is-negative' : 'is-positive'}`}>
                {p.score}<span className="final-score-unit">Pts</span>
              </span>
            </li>
          ))}
        </ol>
        <button className="btn-primary btn-lg" onClick={() => { resetGameState(); navigate('/'); }}>
          Zurück zur Startseite
        </button>
      </div>
    );
  }

  const phaseLabel: Record<string, string> = {
    QUESTION_OPEN: 'Wähle eine Frage',
    ACTIVE_PLAYER_ANSWERING: 'Spieler antwortet',
    BUZZER_PHASE: 'Buzzer-Phase',
    QUESTION_DONE: 'Frage abgeschlossen',
  };
  const phaseDotColor =
    phase === 'BUZZER_PHASE' ? 'var(--gold)' :
    phase === 'ACTIVE_PLAYER_ANSWERING' ? 'var(--success)' :
    phase === 'QUESTION_DONE' ? 'var(--primary)' : 'var(--text-muted)';

  const canJudge = currentQuestion && judgingPlayerId &&
    (phase === 'ACTIVE_PLAYER_ANSWERING' || (phase === 'BUZZER_PHASE' && buzzedPlayerId));

  const numRows = board.length > 0 ? Math.max(...board.map((c) => c.questions.length)) : 5;

  return (
    <div className="control-layout">
      {/* Left: Board */}
      <div className="board-section">
        <div className="board-header">
          <span className="board-label">BOARD</span>
          <div className="board-meta">
            {currentQuestion && (
              <span className="board-shortcut-hint">
                <kbd>Enter</kbd> Richtig · <kbd>Esc</kbd> Falsch
              </span>
            )}
            <span className="board-progress">{playedQ}/{totalQ} gespielt</span>
          </div>
        </div>

        <div
          className="board-grid"
          style={{
            gridTemplateColumns: `repeat(${board.length}, 1fr)`,
            gridTemplateRows: `auto repeat(${numRows}, 1fr)`,
          }}
        >
          {board.map((cat) => (
            <div key={cat.id + 'h'} className="board-category">{cat.name}</div>
          ))}
          {Array.from({ length: numRows }).map((_, ri) =>
            board.map((cat) => {
              const q = cat.questions[ri];
              if (!q) return <div key={`empty-${cat.id}-${ri}`} style={{ background: 'var(--bg)', borderRadius: 8 }} />;
              const isActive = currentQuestion?.questionId === q.id;
              return (
                <button
                  key={q.id}
                  className={`board-cell ${q.played ? 'played' : ''} ${isActive ? 'active' : ''}`}
                  onClick={() => openQuestion(q)}
                  disabled={q.played || !!currentQuestion}
                >
                  {q.played ? '' : q.points}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Sidebar */}
      <aside className="control-sidebar">
        {/* Active question */}
        <div className="sidebar-section" style={{ minHeight: 90 }}>
          <div className="sidebar-label">AKTIVE FRAGE</div>
          {currentQuestion ? (
            <div style={{ animation: 'fadeIn 0.2s ease' }}>
              <div className="question-meta">
                <span className="q-category">{currentQuestion.category}</span>
                <span className="q-points">{currentQuestion.points} Pts</span>
              </div>
              <p className="q-text">{currentQuestion.text}</p>
              {currentQuestion.imageUrl && <img src={currentQuestion.imageUrl} alt="" className="q-media" />}
              {currentQuestion.audioUrl && <audio src={currentQuestion.audioUrl} controls className="q-media" />}
              {currentQuestion.videoUrl && <video src={currentQuestion.videoUrl} controls className="q-media" />}
              {/* Answer reveal */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
                <button className="q-answer-toggle" onClick={() => setShowAnswer((s) => !s)}>
                  {showAnswer ? '▲ Antwort verbergen' : '▼ Antwort aufdecken'}
                </button>
                {showAnswer && (
                  currentQuestion.answer ? (
                    <div className="q-answer-box">{currentQuestion.answer}</div>
                  ) : (
                    <div className="q-no-answer">Keine Antwort hinterlegt</div>
                  )
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, paddingTop: 8 }}>
              Klicke auf eine Frage im Board
            </div>
          )}
        </div>

        {/* Phase panel */}
        <div className="sidebar-section">
          <div className="phase-indicator">
            <div
              className="phase-dot"
              style={{ background: phaseDotColor, boxShadow: `0 0 7px ${phaseDotColor}` }}
            />
            <span className="phase-name">{phaseLabel[phase] ?? phase}</span>
          </div>

          {phase === 'ACTIVE_PLAYER_ANSWERING' && activePlayerName && (
            <div className="player-badge">
              <div className="player-badge-avatar active-player">{activePlayerName[0]}</div>
              <div>
                <div className="player-badge-label">Aktiver Spieler</div>
                <div className="player-badge-name">{activePlayerName}</div>
              </div>
            </div>
          )}

          {phase === 'BUZZER_PHASE' && (
            <>
              {buzzedPlayerName ? (
                <div className="player-badge" style={{ border: '1px solid rgba(240,180,41,0.3)', animation: 'buzz 0.4s ease' }}>
                  <div className="player-badge-avatar buzzed-player">{buzzedPlayerName[0]}</div>
                  <div>
                    <div className="player-badge-label">🔔 Gebuzzert</div>
                    <div className="player-badge-name">{buzzedPlayerName}</div>
                  </div>
                </div>
              ) : (
                <div className="buzzer-waiting">
                  <span style={{ fontSize: 18 }}>⏳</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Warte auf Buzzer…</span>
                </div>
              )}
              {!buzzedPlayerName && (
                <button className="close-question-btn" onClick={endBuzzerPhase}>
                  Buzzer-Phase beenden
                </button>
              )}
            </>
          )}

          {phase === 'QUESTION_DONE' && (
            <div className="judge-buttons">
              <button
                className="btn-primary"
                onClick={revealAnswer}
                disabled={answerBroadcast}
                style={{ opacity: answerBroadcast ? 0.5 : 1 }}
              >
                {answerBroadcast ? '✓ Lösung gesendet' : '▼ Lösung aufdecken'}
              </button>
              <button className="btn-secondary" onClick={closeQuestion}>
                ✕ Frage beenden
              </button>
            </div>
          )}

          {canJudge && (
            <div className="judge-buttons">
              <div className="judging-label">
                Antwort von <strong>{judgingPlayerName}</strong>:
              </div>
              <button className="btn-correct" onClick={() => judgeAnswer(true)} disabled={answering}>
                ✓ Richtig
              </button>
              <button className="btn-wrong" onClick={() => judgeAnswer(false)} disabled={answering}>
                ✗ Falsch
              </button>
            </div>
          )}
        </div>

        {/* Scores + Cameras */}
        <div className="sidebar-section sidebar-section--grow" style={{ flex: 1, overflowY: 'auto' }}>
          <div className="sidebar-label-row">
            <span className="sidebar-label">SCORES</span>
            <button
              className={`cam-toggle-btn ${camEnabled ? 'cam-on' : 'cam-off'}`}
              onClick={toggleCam}
              title={camEnabled ? 'Kamera ausschalten' : 'Kamera einschalten'}
            >
              {camEnabled ? '📷' : '📵'}
            </button>
          </div>
          {/* Own camera preview when enabled */}
          {camEnabled && myStream.current && (
            <div className="admin-own-cam-row">
              <div className="admin-own-cam-wrap">
                <CamTile stream={myStream.current} name="Moderator" isSelf />
              </div>
              <span className="admin-own-cam-label">Du (Moderator)</span>
            </div>
          )}
          {orderedPlayers.map((p) => {
            const peer = activeCams.get(p.id);
            return (
              <ScoreRow
                key={p.id}
                playerId={p.id}
                name={p.name}
                score={p.score}
                roomCode={roomCode}
                isActive={p.id === activePlayerId}
                delta={deltas[p.id]}
                camStream={peer ? (peer.stream ?? null) : undefined}
              />
            );
          })}
          <div className="score-hint">Score anklicken zum Bearbeiten</div>
        </div>
      </aside>
    </div>
  );
}
