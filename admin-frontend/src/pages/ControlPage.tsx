import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import type { Question } from '../types';
import type { QuizSummary } from '../types/library';
import type { ToastType } from '../App';
import { API, apiFetch } from '../api/client';
import { listQuizzes, loadQuizFromLibrary } from '../api/library';
import { send, addMessageListener } from '../ws/socket';

interface ScoreDelta {
  val: number;
  key: number;
}

interface Props {
  toast: (msg: string, type?: ToastType) => void;
}

// ---- Score Row ----

function ScoreRow({
  playerId, name, score, roomCode, isActive, delta,
}: {
  playerId: string; name: string; score: number; roomCode: string; isActive: boolean; delta?: ScoreDelta;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(score));

  async function save() {
    const val = parseInt(draft, 10);
    if (isNaN(val)) return;
    await apiFetch(`${API}/api/rooms/${roomCode}/players/${playerId}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: val }),
    });
    setEditing(false);
  }

  return (
    <div className="score-row">
      <div className={`score-avatar ${isActive ? 'is-active' : 'not-active'}`}>
        {name[0]}
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
    timerEndsAt, timerDurMs,
  } = useGameStore();
  const roomCode = urlCode ?? storeRoomCode;

  const [answering, setAnswering] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [answerBroadcast, setAnswerBroadcast] = useState(false);
  const [deltas, setDeltas] = useState<Record<string, ScoreDelta>>({});

  // Multi-Board state
  const [libraryQuizzes, setLibraryQuizzes] = useState<QuizSummary[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingBoard, setLoadingBoard] = useState(false);

  // Media state
  const [mediaPlaying, setMediaPlaying] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Reset media state when question changes
  useEffect(() => {
    setMediaPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [currentQuestion?.questionId]);

  // Sync own media element when mediaPlaying changes
  useEffect(() => {
    if (mediaPlaying) {
      videoRef.current?.play().catch(() => {});
      audioRef.current?.play().catch(() => {});
    } else {
      videoRef.current?.pause();
      audioRef.current?.pause();
    }
  }, [mediaPlaying]);

  // Receive MEDIA_PLAY/PAUSE/SEEK from server (echoed back to admin too)
  useEffect(() => {
    return addMessageListener((msg) => {
      if (msg.type === 'MEDIA_PLAY') setMediaPlaying(true);
      if (msg.type === 'MEDIA_PAUSE') setMediaPlaying(false);
    });
  }, []);

  function toggleMedia() {
    const next = !mediaPlaying;
    send(next ? 'MEDIA_PLAY' : 'MEDIA_PAUSE', {});
    // State will be updated via the echoed WS message
  }

  function handleAdminSeeked(el: HTMLVideoElement | HTMLAudioElement) {
    send('MEDIA_SEEK', { time: el.currentTime });
  }

  // Timer countdown
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!timerEndsAt) { setTimerRemaining(null); return; }
    const tick = () => {
      const rem = Math.max(0, Math.round((timerEndsAt - Date.now()) / 1000));
      setTimerRemaining(rem);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [timerEndsAt]);

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

  async function fetchLibraryForNextBoard() {
    setLoadingLibrary(true);
    try {
      const quizzes = await listQuizzes();
      setLibraryQuizzes(quizzes);
    } catch {
      toast('Bibliothek konnte nicht geladen werden', 'error');
    } finally {
      setLoadingLibrary(false);
    }
  }

  async function loadNextBoardFromLibrary(quizId: string) {
    setLoadingBoard(true);
    try {
      await loadQuizFromLibrary(roomCode, quizId);
      setLibraryQuizzes([]);
      toast('Neues Board geladen', 'success');
    } catch {
      toast('Board konnte nicht geladen werden', 'error');
    } finally {
      setLoadingBoard(false);
    }
  }

  async function endGameNow() {
    await apiFetch(`${API}/api/rooms/${roomCode}/end`, { method: 'POST' });
    toast('Spiel beendet', 'info');
  }

  async function openQuestion(q: Question) {
    if (q.played) return;
    setShowAnswer(false);
    setAnswerBroadcast(false);
    await apiFetch(`${API}/api/rooms/${roomCode}/question/${q.id}/open`, { method: 'POST' });
  }

  async function closeQuestion() {
    await apiFetch(`${API}/api/rooms/${roomCode}/question/close`, { method: 'POST' });
    toast('Frage beendet', 'info');
  }

  async function revealAnswer() {
    await apiFetch(`${API}/api/rooms/${roomCode}/question/reveal`, { method: 'POST' });
    setAnswerBroadcast(true);
    toast('Lösung an Spieler gesendet', 'success');
  }

  async function endBuzzerPhase() {
    await apiFetch(`${API}/api/rooms/${roomCode}/question/end-buzzer`, { method: 'POST' });
    toast('Buzzer-Phase beendet', 'warning');
  }

  async function startTimer(seconds: number) {
    await apiFetch(`${API}/api/rooms/${roomCode}/question/timer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds }),
    });
  }

  async function judgeAnswer(correct: boolean) {
    if (!judgingPlayerId || !currentQuestion) return;
    setAnswering(true);
    try {
      await apiFetch(`${API}/api/rooms/${roomCode}/answer`, {
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

  useEffect(() => {
    if (!roomCode) return;
    apiFetch(`${API}/api/rooms/${roomCode}`)
      .then((r) => r.ok ? r.json() : null)
      .then((snap) => { if (snap) handleMessage({ type: 'GAME_STATE', payload: snap }); })
      .catch(() => {});
  }, [roomCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (roomPhase === 'IN_PROGRESS') { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [roomPhase]);

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

  if (phase === 'BOARD_COMPLETE') {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    return (
      <div className="gameover-page">
        <div className="gameover-trophy">🏁</div>
        <h1>Board abgeschlossen!</h1>
        <p className="gameover-subtitle">Alle Fragen gespielt – nächstes Board laden oder Spiel beenden</p>

        <ol className="final-scores" style={{ marginBottom: 24 }}>
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

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
          <button className="btn-primary btn-lg" onClick={fetchLibraryForNextBoard} disabled={loadingLibrary}>
            {loadingLibrary ? 'Lade…' : '📚 Board aus Bibliothek laden'}
          </button>
          <button className="btn-secondary btn-lg" onClick={endGameNow}>
            🏆 Spiel beenden
          </button>
        </div>

        {libraryQuizzes.length > 0 && (
          <div className="board-complete-library">
            <div className="sidebar-label" style={{ marginBottom: 10 }}>BIBLIOTHEK</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {libraryQuizzes.map((q) => (
                <button
                  key={q.id}
                  className="btn-secondary"
                  onClick={() => loadNextBoardFromLibrary(q.id)}
                  disabled={loadingBoard}
                  style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2 }}
                >
                  <span style={{ fontWeight: 600 }}>{q.name}</span>
                  {q.description && <span style={{ fontSize: 12, opacity: 0.7 }}>{q.description}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

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

              {currentQuestion.imageUrl && (
                <img
                  src={currentQuestion.imageUrl}
                  alt=""
                  className="q-media q-media--zoomable"
                  onClick={() => setZoomedImage(currentQuestion.imageUrl!)}
                  title="Klicken zum Vergrößern"
                />
              )}

              {(currentQuestion.audioUrl || currentQuestion.videoUrl) && (
                <div className="media-sync-controls">
                  <button
                    className={`media-sync-btn ${mediaPlaying ? 'media-sync-btn--pause' : 'media-sync-btn--play'}`}
                    onClick={toggleMedia}
                    title={mediaPlaying ? 'Pause für alle' : 'Play für alle'}
                  >
                    {mediaPlaying ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <span className="media-sync-hint">synchron bei allen Spielern</span>
                </div>
              )}

              {currentQuestion.audioUrl && (
                <audio ref={audioRef} src={currentQuestion.audioUrl} controls loop className="q-media" style={{ width: '100%' }}
                  onSeeked={() => handleAdminSeeked(audioRef.current!)} />
              )}
              {currentQuestion.videoUrl && (
                <video ref={videoRef} src={currentQuestion.videoUrl} controls loop className="q-media q-media--video"
                  onSeeked={() => handleAdminSeeked(videoRef.current!)} />
              )}

              {/* Timer controls */}
              <div className="timer-control">
                {timerRemaining !== null ? (
                  <div className="timer-running">
                    <span className="timer-running-icon">⏱</span>
                    <span className={`timer-running-value ${timerRemaining <= 5 ? 'timer-urgent' : ''}`}>
                      {timerRemaining}s
                    </span>
                    <button className="timer-stop-btn" onClick={() => startTimer(0)}>Stopp</button>
                    {timerDurMs && (
                      <div className="timer-bar-track" title={`${timerRemaining}s verbleibend`}>
                        <div
                          className="timer-bar-fill"
                          style={{ width: `${Math.max(0, (timerRemaining / (timerDurMs / 1000)) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="timer-presets">
                    <span className="timer-label">⏱ Timer:</span>
                    {[15, 30, 60].map((s) => (
                      <button key={s} className="timer-preset-btn" onClick={() => startTimer(s)}>
                        {s}s
                      </button>
                    ))}
                  </div>
                )}
              </div>

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

        {/* Scores */}
        <div className="sidebar-section sidebar-section--grow" style={{ flex: 1, overflowY: 'auto' }}>
          <div className="sidebar-label">SCORES</div>
          {orderedPlayers.map((p) => (
            <ScoreRow
              key={p.id}
              playerId={p.id}
              name={p.name}
              score={p.score}
              roomCode={roomCode}
              isActive={p.id === activePlayerId}
              delta={deltas[p.id]}
            />
          ))}
          <div className="score-hint">Score anklicken zum Bearbeiten</div>
        </div>
      </aside>

      {/* Image zoom lightbox */}
      {zoomedImage && (
        <div className="lightbox-overlay" onClick={() => setZoomedImage(null)}>
          <img src={zoomedImage} alt="" className="lightbox-img" />
        </div>
      )}
    </div>
  );
}
