import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { buzz } from '../ws/socket';

const BACKEND = `http://${window.location.hostname}:8080`;

function mediaUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  return `${BACKEND}${url}`;
}

interface ScoreDelta {
  val: number;
  key: number;
}

export default function GamePage() {
  const navigate = useNavigate();
  const {
    phase, board, players, playerOrder,
    myPlayerId, myPlayerName,
    activePlayerId, activePlayerName,
    currentQuestion,
    buzzerOpen, hasBuzzed,
    buzzedPlayerId, buzzedPlayerName,
    roomReset, clearRoomReset, roomCode,
  } = useGameStore();

  const [deltas, setDeltas] = useState<Record<string, ScoreDelta>>({});
  const prevScores = useRef<Record<string, number>>({});

  useEffect(() => {
    if (roomReset) { clearRoomReset(); navigate('/'); return; }
    if (phase === 'LOBBY') navigate('/waiting');
    if (phase === 'GAME_OVER') navigate('/end');
  }, [phase, roomReset, navigate, clearRoomReset]);

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

  const me = players.find((p) => p.id === myPlayerId);
  const myScore = me?.score ?? 0;
  const leaderboard = [...players].sort((a, b) => b.score - a.score);

  const totalQ = board.reduce((a, c) => a + c.questions.length, 0);
  const playedQ = board.reduce((a, c) => a + c.questions.filter((q) => q.played).length, 0);

  // Ordered players for strip
  const orderedPlayers = playerOrder.length > 0
    ? playerOrder.map((id) => players.find((p) => p.id === id)).filter(Boolean) as typeof players
    : players;

  function handleBuzz() {
    if (!buzzerOpen || hasBuzzed) return;
    buzz();
  }

  // Spacebar to buzz
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

  // Phase-aware overlay state
  const showOverlay = currentQuestion !== null;
  const amActive = myPlayerId === activePlayerId;
  const iBuzzed = hasBuzzed && buzzedPlayerId === myPlayerId;
  const otherBuzzed = buzzedPlayerId && buzzedPlayerId !== myPlayerId;

  type OverlayPhase = 'answering-me' | 'answering-other' | 'buzzer' | 'buzzed-me' | 'buzzed-other';
  let overlayPhase: OverlayPhase = 'answering-other';
  if (phase === 'ACTIVE_PLAYER_ANSWERING') {
    overlayPhase = amActive ? 'answering-me' : 'answering-other';
  } else if (phase === 'BUZZER_PHASE') {
    if (iBuzzed) overlayPhase = 'buzzed-me';
    else if (otherBuzzed) overlayPhase = 'buzzed-other';
    else if (buzzerOpen) overlayPhase = 'buzzer';
    else overlayPhase = 'buzzed-other';
  }

  const statusConfigs: Record<OverlayPhase, { color: string; icon: string; text: string }> = {
    'answering-me':    { color: 'var(--success)', icon: '🎯', text: 'Du bist dran! Antworte dem Moderator.' },
    'answering-other': { color: 'var(--text-muted)', icon: '⏳', text: `${activePlayerName ?? '…'} antwortet gerade…` },
    'buzzer':          { color: 'var(--gold)', icon: '🔔', text: 'Jetzt buzzern! Wer zuerst drückt, darf antworten.' },
    'buzzed-me':       { color: 'var(--gold)', icon: '🔔', text: 'Du hast gebuzzert! Antworte dem Moderator.' },
    'buzzed-other':    { color: 'var(--text-muted)', icon: '🔔', text: `${buzzedPlayerName ?? '…'} hat gebuzzert.` },
  };
  const statusCfg = statusConfigs[overlayPhase];

  const buzzerClass = overlayPhase === 'buzzer'
    ? 'active'
    : overlayPhase === 'buzzed-me'
    ? 'buzzed-me'
    : overlayPhase === 'buzzed-other'
    ? 'taken'
    : 'inactive';

  const showBuzzerSection = overlayPhase === 'buzzer' || overlayPhase === 'buzzed-me' || overlayPhase === 'buzzed-other';

  const numRows = board[0]?.questions.length ?? 5;

  return (
    <div className="game-page">
      {/* Nav */}
      <nav className="game-nav">
        <div className="game-nav-brand">
          <span className="game-nav-brand-icon">⚡</span>BrainStorm
        </div>
        <div className="game-nav-progress">
          <div className="game-nav-progress-bar">
            <div className="game-nav-progress-fill" style={{ width: `${totalQ ? (playedQ / totalQ) * 100 : 0}%` }} />
          </div>
          <span className="game-nav-progress-label">{playedQ}/{totalQ}</span>
        </div>
        <div className="game-nav-spacer" />
        <div className="game-nav-identity">
          <div className="game-nav-avatar">{myPlayerName[0]}</div>
          <span className="game-nav-name">{myPlayerName}</span>
        </div>
        <div className="game-nav-score-box">
          <span className="game-nav-score-label">Score</span>
          <span className={`game-nav-score-value ${myScore < 0 ? 'negative' : 'positive'}`}>{myScore}</span>
          {deltas[myPlayerId] && (
            <span key={deltas[myPlayerId].key} className={`game-nav-score-delta ${deltas[myPlayerId].val > 0 ? 'positive' : 'negative'}`}>
              {deltas[myPlayerId].val > 0 ? '+' : ''}{deltas[myPlayerId].val}
            </span>
          )}
        </div>
        {roomCode && <span className="game-nav-room-badge">{roomCode}</span>}
      </nav>

      {/* Board area */}
      <div className="game-board-area">
        <div className="game-board-scroll">
          <div className="game-board-header">
            <span className="game-board-label">BOARD</span>
            {showOverlay && (
              <div className="game-board-status">
                <span style={{ color: statusCfg.color }}>{statusCfg.icon}</span>
                <span style={{ color: statusCfg.color, fontWeight: 600 }}>{statusCfg.text}</span>
              </div>
            )}
          </div>
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
          {orderedPlayers.map((p, i) => {
            const isActive = p.id === activePlayerId;
            const isMe = p.id === myPlayerId;
            const avatarClass = isMe ? 'is-me' : isActive ? 'is-active' : 'default';
            const cardClass = isMe ? 'is-me' : isActive ? 'is-active' : '';
            return (
              <div key={p.id} className={`player-strip-card ${cardClass}`}>
                <div className="player-strip-num">#{i + 1}</div>
                <div className={`player-strip-avatar ${avatarClass}`}>{p.name[0]}</div>
                {isActive && <div className="player-strip-active-label">● DRAN</div>}
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
            );
          })}
        </div>
      </div>

      {/* Question overlay */}
      {showOverlay && (
        <div className="question-overlay">
          <div className="overlay-question-area">
            {/* Meta */}
            <div className="overlay-meta">
              <span className="overlay-category">{currentQuestion!.category}</span>
              <div className="overlay-points-badge">
                <span className="overlay-points-value">{currentQuestion!.points}</span>
                <span className="overlay-points-unit">Punkte</span>
              </div>
            </div>

            {/* Question text */}
            <h2 className="overlay-question-text">{currentQuestion!.text}</h2>

            {/* Media */}
            {mediaUrl(currentQuestion!.imageUrl) && (
              <img src={mediaUrl(currentQuestion!.imageUrl)} alt="" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
            )}
            {mediaUrl(currentQuestion!.audioUrl) && (
              <audio src={mediaUrl(currentQuestion!.audioUrl)} controls autoPlay />
            )}
            {mediaUrl(currentQuestion!.videoUrl) && (
              <video src={mediaUrl(currentQuestion!.videoUrl)} controls autoPlay style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
            )}

            {/* Status banner */}
            <div
              className="overlay-status-banner"
              style={{ background: `${statusCfg.color}12`, border: `1px solid ${statusCfg.color}30` }}
            >
              <span className="overlay-status-icon">{statusCfg.icon}</span>
              <span className="overlay-status-text" style={{ color: statusCfg.color }}>{statusCfg.text}</span>
            </div>

            {/* Buzzer */}
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
          </div>

          {/* Mini leaderboard */}
          <div className="mini-leaderboard">
            {leaderboard.map((p, i) => (
              <div key={p.id} className={`mini-lb-entry ${p.id === myPlayerId ? 'is-me' : ''}`}>
                <span className="mini-lb-rank">#{i + 1}</span>
                <span className={`mini-lb-name ${p.id === myPlayerId ? 'is-me' : ''}`}>{p.name}</span>
                <span className={`mini-lb-score ${p.score < 0 ? 'negative' : 'positive'}`}>{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
