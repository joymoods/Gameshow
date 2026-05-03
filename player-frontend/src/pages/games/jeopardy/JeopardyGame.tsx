import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../../store/gameStore';
import { buzz } from '../../../ws/socket';
import { playBuzz, playCorrect, playWrong } from '../../../audio';
import { getGameLogo } from '../../../utils/gameLogos';
import { useWebRTC } from '../../../hooks/useWebRTC';

const BACKEND = import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}`;

function mediaUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  return `${BACKEND}${url}`;
}

interface ScoreDelta {
  val: number;
  key: number;
}

function CamTile({ stream, name, isSelf }: { stream: MediaStream | null; name: string; isSelf: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) {
    return (
      <div className="cam-tile cam-tile--avatar">
        <span className="cam-tile-initial">{name[0]?.toUpperCase() ?? '?'}</span>
      </div>
    );
  }
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isSelf}
      className={`cam-tile cam-tile--video${isSelf ? ' cam-tile--mirrored' : ''}`}
    />
  );
}

export default function JeopardyGame() {
  const {
    phase, board, players, playerOrder,
    myPlayerId, myPlayerName,
    activePlayerId, activePlayerName,
    currentQuestion,
    buzzerOpen, hasBuzzed,
    buzzedPlayerId, buzzedPlayerName,
    revealedAnswer,
    lastAnswerResult,
    gameType,
  } = useGameStore();
  const gameLogo = getGameLogo(gameType);
  const { camEnabled, activeCams, myStream, toggleCam } = useWebRTC(myPlayerId, myPlayerName);

  const [deltas, setDeltas] = useState<Record<string, ScoreDelta>>({});
  const prevScores = useRef<Record<string, number>>({});

  type AnswerFeedback = 'correct' | 'wrong' | 'correct-stay' | null;
  const [answerFeedback, setAnswerFeedback] = useState<AnswerFeedback>(null);

  // Reset feedback when a new question opens
  useEffect(() => {
    setAnswerFeedback(null);
  }, [currentQuestion?.questionId]);

  // Handle answer result feedback animation
  useEffect(() => {
    if (!lastAnswerResult) { setAnswerFeedback(null); return; }
    if (lastAnswerResult.correct) {
      setAnswerFeedback('correct');
      const t = setTimeout(() => setAnswerFeedback('correct-stay'), 700);
      return () => clearTimeout(t);
    } else {
      setAnswerFeedback('wrong');
      const t = setTimeout(() => setAnswerFeedback(null), 900);
      return () => clearTimeout(t);
    }
  }, [lastAnswerResult]);

  // Detect score changes and trigger delta animation
  useEffect(() => {
    players.forEach((p) => {
      const prev = prevScores.current[p.id];
      if (prev !== undefined && prev !== p.score) {
        const val = p.score - prev;
        const key = Date.now() + Math.random();
        setDeltas((d) => ({ ...d, [p.id]: { val, key } }));
        setTimeout(() => setDeltas((d) => { const n = { ...d }; delete n[p.id]; return n; }), 2000);
      }
    });
    prevScores.current = Object.fromEntries(players.map((p) => [p.id, p.score]));
  }, [players]);

  // Sound: buzzer opens → play buzz for eligible players
  useEffect(() => {
    if (buzzerOpen && !hasBuzzed) playBuzz();
  }, [buzzerOpen]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Sound: answer result
  useEffect(() => {
    if (!lastAnswerResult) return;
    if (lastAnswerResult.playerId === myPlayerId) {
      lastAnswerResult.correct ? playCorrect() : playWrong();
    }
  }, [lastAnswerResult]);  // eslint-disable-line react-hooks/exhaustive-deps

  const orderedPlayers = playerOrder.length > 0
    ? playerOrder.map((id) => players.find((p) => p.id === id)).filter(Boolean) as typeof players
    : players;

  function handleBuzz() {
    if (!buzzerOpen || hasBuzzed) return;
    buzz();
  }

  const handleBuzzRef = useRef(handleBuzz);
  handleBuzzRef.current = handleBuzz;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' && buzzerOpen && !hasBuzzed) {
        e.preventDefault();
        handleBuzzRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [buzzerOpen, hasBuzzed]);

  const feedbackClass = answerFeedback ? `feedback-${answerFeedback}` : '';

  const showOverlay = currentQuestion !== null;
  const amActive = myPlayerId === activePlayerId;
  const iBuzzed = hasBuzzed && buzzedPlayerId === myPlayerId;
  const otherBuzzed = buzzedPlayerId && buzzedPlayerId !== myPlayerId;

  type OverlayPhase = 'answering-me' | 'answering-other' | 'buzzer' | 'buzzed-me' | 'buzzed-other' | 'question-done';
  let overlayPhase: OverlayPhase = 'answering-other';
  if (phase === 'ACTIVE_PLAYER_ANSWERING') {
    overlayPhase = amActive ? 'answering-me' : 'answering-other';
  } else if (phase === 'BUZZER_PHASE') {
    if (iBuzzed) overlayPhase = 'buzzed-me';
    else if (otherBuzzed) overlayPhase = 'buzzed-other';
    else if (buzzerOpen) overlayPhase = 'buzzer';
    else overlayPhase = 'buzzed-other';
  } else if (phase === 'QUESTION_DONE') {
    overlayPhase = 'question-done';
  }

  const statusConfigs: Record<OverlayPhase, { color: string; icon: string; text: string }> = {
    'answering-me':    { color: 'var(--success)', icon: '🎯', text: 'Du bist dran! Antworte dem Moderator.' },
    'answering-other': { color: 'var(--text-muted)', icon: '⏳', text: `${activePlayerName ?? '…'} antwortet gerade…` },
    'buzzer':          { color: 'var(--gold)', icon: '🔔', text: 'Jetzt buzzern! Wer zuerst drückt, darf antworten.' },
    'buzzed-me':       { color: 'var(--gold)', icon: '🔔', text: 'Du hast gebuzzert! Antworte dem Moderator.' },
    'buzzed-other':    { color: 'var(--text-muted)', icon: '🔔', text: `${buzzedPlayerName ?? '…'} hat gebuzzert.` },
    'question-done':   { color: 'var(--primary)', icon: '✅', text: revealedAnswer ? 'Lösung:' : 'Warte auf den Moderator…' },
  };
  const statusCfg = statusConfigs[overlayPhase];

  const buzzerClass = overlayPhase === 'buzzer'
    ? 'active'
    : overlayPhase === 'buzzed-me'
    ? 'buzzed-me'
    : overlayPhase === 'buzzed-other'
    ? 'taken'
    : 'inactive';

  const showBuzzerSection = (overlayPhase === 'buzzer' || overlayPhase === 'buzzed-me' || overlayPhase === 'buzzed-other') && phase !== 'QUESTION_DONE';

  const numRows = board.length > 0 ? Math.max(...board.map((c) => c.questions.length)) : 5;

  return (
    <div className="game-page">
      {/* Board area */}
      <div className="game-board-area">
        <div className="game-board-scroll">
          {gameLogo && (
            <div className="game-board-logo-center">
              <img src={gameLogo} alt="Logo" className="game-board-logo-center-img" />
            </div>
          )}
          <div
            className="game-board-grid"
            style={{
              gridTemplateColumns: `repeat(${board.length}, 1fr)`,
              gridTemplateRows: `auto repeat(${numRows}, 1fr)`,
            }}
          >
            {board.map((c) => (
              <div key={c.id + 'h'} className="game-board-cat-header">{c.name}</div>
            ))}
            {Array.from({ length: numRows }).map((_, ri) =>
              board.map((c) => {
                const q = c.questions[ri];
                if (!q) return <div key={`e-${c.id}-${ri}`} />;
                return (
                  <div key={q.id} className={`game-board-cell ${q.played ? 'played' : ''}`}>
                    {q.played ? '' : q.points}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Player strip */}
        <div className="player-strip">
          {/* Admin camera tile */}
          {activeCams.has('admin') && (
            <div className="player-strip-card">
              <div className="player-strip-cam">
                <CamTile
                  stream={activeCams.get('admin')!.stream}
                  name={activeCams.get('admin')!.name || 'Moderator'}
                  isSelf={false}
                />
              </div>
              <div className="player-strip-bottom">
                <div className="player-strip-name other">Moderator</div>
              </div>
            </div>
          )}

          {orderedPlayers.map((p) => {
            const isActive = p.id === activePlayerId;
            const isMe = p.id === myPlayerId;
            const cardClass = isMe ? 'is-me' : isActive ? 'is-active' : '';
            const peerCam = isMe
              ? (camEnabled ? { stream: myStream.current, name: p.name } : null)
              : activeCams.get(p.id) ?? null;
            return (
              <div key={p.id} className={`player-strip-card ${cardClass}`}>
                {isActive && <div className="player-strip-active-label">● DRAN</div>}
                <div className="player-strip-cam">
                  <CamTile
                    stream={peerCam?.stream ?? null}
                    name={p.name}
                    isSelf={isMe}
                  />
                </div>
                <div className="player-strip-bottom">
                  <div className={`player-strip-name ${isMe ? 'is-me' : 'other'}`}>{p.name}</div>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <div className={`player-strip-score ${p.score < 0 ? 'negative' : 'positive'}`}>{p.score}</div>
                    {deltas[p.id] && (
                      <span key={deltas[p.id].key} className={`player-strip-delta ${deltas[p.id].val > 0 ? 'positive' : 'negative'}`}>
                        {deltas[p.id].val > 0 ? '+' : ''}{deltas[p.id].val}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Camera toggle button */}
          <button
            className={`cam-toggle-btn ${camEnabled ? 'cam-on' : 'cam-off'}`}
            onClick={toggleCam}
            title={camEnabled ? 'Kamera ausschalten' : 'Kamera einschalten'}
          >
            {camEnabled ? '📷' : '📵'}
          </button>
        </div>
      </div>

      {/* Question overlay */}
      {showOverlay && (
        <div className="question-overlay">
          {/* Buzzer — absolute top-right */}
          {showBuzzerSection && (
            <div className="buzzer-wrapper">
              <div className="buzzer-relative">
                {overlayPhase === 'buzzer' && !hasBuzzed && <div className="buzzer-ping" />}
                <button
                  className={`buzzer-btn ${buzzerClass}`}
                  onPointerDown={handleBuzz}
                  disabled={overlayPhase !== 'buzzer' || hasBuzzed}
                >
                  {overlayPhase === 'buzzed-me' ? (
                    <><span style={{ fontSize: 34 }}>🔔</span><span className="buzzer-sublabel">Gebuzzert!</span></>
                  ) : overlayPhase === 'buzzed-other' ? (
                    <><span style={{ fontSize: 28, opacity: 0.3 }}>🔔</span><span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Vergeben</span></>
                  ) : (
                    <span className="buzzer-label">BUZZ</span>
                  )}
                </button>
              </div>
              {overlayPhase === 'buzzer' && !hasBuzzed && (
                <div className="buzzer-hint">
                  <kbd>Leertaste</kbd>
                  <span>oder Button drücken</span>
                </div>
              )}
            </div>
          )}
          <div className="overlay-question-area">
            <div className={`overlay-main-card ${feedbackClass}`}>
              <div className="overlay-question-content">
                <div className="overlay-meta">
                  <span className="overlay-category">{currentQuestion!.category}</span>
                  <div className="overlay-points-badge">
                    <span className="overlay-points-value">{currentQuestion!.points}</span>
                    <span className="overlay-points-unit">Punkte</span>
                  </div>
                </div>
                <h2 className="overlay-question-text">{currentQuestion!.text}</h2>
                {mediaUrl(currentQuestion!.imageUrl) && (
                  <img src={mediaUrl(currentQuestion!.imageUrl)} alt="" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
                )}
                {mediaUrl(currentQuestion!.audioUrl) && (
                  <audio src={mediaUrl(currentQuestion!.audioUrl)} controls autoPlay />
                )}
                {mediaUrl(currentQuestion!.videoUrl) && (
                  <video src={mediaUrl(currentQuestion!.videoUrl)} controls autoPlay style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
                )}
              </div>

              <div className="overlay-divider" />

              <div
                className="overlay-status-banner"
                style={{ background: `${statusCfg.color}12`, border: `1px solid ${statusCfg.color}30` }}
              >
                <span className="overlay-status-icon">{statusCfg.icon}</span>
                <span className="overlay-status-text" style={{ color: statusCfg.color }}>{statusCfg.text}</span>
              </div>

              {revealedAnswer && (
                <div className="overlay-revealed-answer">{revealedAnswer}</div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
