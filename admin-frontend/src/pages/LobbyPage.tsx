import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useGameStore } from '../store/gameStore';
import { useLobbyStore } from '../store/lobbyStore';
import type { GameType } from '../types';
import type { ToastType } from '../App';

const API = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}`;

interface Props {
  toast: (msg: string, type?: ToastType) => void;
}

function QrCode({ roomCode }: { roomCode: string }) {
  const playerBase = import.meta.env.VITE_PLAYER_URL ?? `http://${window.location.hostname}/player`;
  const url = `${playerBase}/?room=${roomCode}`;
  return (
    <div className="qr-placeholder" title={url}>
      <QRCodeSVG value={url} size={110} fgColor="#4f6ef7" bgColor="transparent" />
    </div>
  );
}

const GAME_TYPE_LABELS: Record<string, string> = {
  jeopardy: 'Jeopardy',
};

export default function LobbyPage({ toast }: Props) {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const { players, playerOrder, gameType, roomPhase, board, handleMessage } = useGameStore();
  const { setActiveRoom } = useLobbyStore();

  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pendingGameType, setPendingGameType] = useState<GameType>('jeopardy');
  const [switching, setSwitching] = useState(false);

  // Register active room in lobby store and load initial state
  useEffect(() => {
    if (!code) return;
    setActiveRoom(code);

    async function loadRoom() {
      const res = await fetch(`${API}/api/rooms/${code}`);
      if (!res.ok) {
        toast('Room nicht gefunden', 'error');
        navigate('/');
        return;
      }
      const snap = await res.json();
      handleMessage({ type: 'GAME_STATE', payload: snap });
      setPendingGameType((snap.game_type as GameType) ?? 'jeopardy');
    }
    loadRoom();
  }, [code]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Keep pendingGameType in sync when gameType changes via WS
  useEffect(() => {
    if (gameType) setPendingGameType(gameType);
  }, [gameType]);

  const connectedPlayers = players.filter((p) => p.connected);
  const orderedPlayers = playerOrder
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean) as typeof players;

  function copyCode() {
    if (!code) return;
    const write = () => {
      try {
        navigator.clipboard.writeText(code);
      } catch {
        const el = document.createElement('textarea');
        el.value = code;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
    };
    write();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast('Room-Code kopiert!', 'success');
  }

  async function shuffle() {
    await fetch(`${API}/api/rooms/${code}/players/shuffle`, { method: 'POST' });
  }

  function onDragStart(index: number) {
    setDragIndex(index);
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newOrder = [...playerOrder];
    const [moved] = newOrder.splice(dragIndex, 1);
    newOrder.splice(index, 0, moved);
    useGameStore.setState({ playerOrder: newOrder });
    setDragIndex(index);
  }

  async function onDragEnd() {
    setDragIndex(null);
    await fetch(`${API}/api/rooms/${code}/players/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playerOrder),
    });
  }

  async function switchGame() {
    setSwitching(true);
    try {
      const res = await fetch(`${API}/api/rooms/${code}/game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_type: pendingGameType }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || 'Spiel-Wechsel fehlgeschlagen', 'error');
        return;
      }
      toast(`Spiel gewechselt zu: ${GAME_TYPE_LABELS[pendingGameType] ?? pendingGameType}`, 'success');
    } catch (e) {
      toast(String(e), 'error');
    } finally {
      setSwitching(false);
    }
  }

  async function startGame() {
    if (connectedPlayers.length === 0) return;
    setStarting(true);
    try {
      const res = await fetch(`${API}/api/rooms/${code}/start`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || 'Fehler beim Starten', 'error');
        return;
      }
      navigate(`/rooms/${code}/control`);
    } finally {
      setStarting(false);
    }
  }

  if (!code) {
    return (
      <div style={{ padding: 24 }}>
        <p>Kein Room-Code. <a href="/admin" style={{ color: 'var(--primary)' }}>Zur Startseite</a></p>
      </div>
    );
  }

  const isLobbyPhase = !roomPhase || roomPhase === 'LOBBY';

  return (
    <div className="lobby-scroll">
      <div className="lobby-inner">
        {/* Room code + QR */}
        <div className="room-code-card">
          <div className="room-code-info">
            <div className="room-code-section-label">ROOM-CODE</div>
            <div className="room-code-value">{code}</div>
            <div className="room-code-hint">Teile diesen Code mit deinen Spielern.</div>
            <button
              className={copied ? 'btn-success btn-sm' : 'btn-secondary btn-sm'}
              onClick={copyCode}
            >
              {copied ? '✓ Kopiert' : 'Code kopieren'}
            </button>
          </div>
          <QrCode roomCode={code} />
        </div>

        {/* Game type */}
        <div className="lobby-players-card">
          <div className="lobby-section-header">
            <h2>Spiel-Typ</h2>
          </div>
          <div className="game-type-row">
            <select
              className="form-select"
              value={pendingGameType}
              onChange={(e) => setPendingGameType(e.target.value as GameType)}
              disabled={!isLobbyPhase}
              title={!isLobbyPhase ? 'Spiel läuft bereits' : ''}
            >
              <option value="jeopardy">Jeopardy</option>
            </select>
            <button
              className="btn-primary btn-sm"
              onClick={switchGame}
              disabled={!isLobbyPhase || pendingGameType === gameType || switching}
              title={!isLobbyPhase ? 'Spiel läuft bereits' : ''}
            >
              {switching ? 'Wechsle…' : 'Übernehmen'}
            </button>
            {!isLobbyPhase && (
              <span className="game-type-hint">Wechsel nur in der Lobby möglich.</span>
            )}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              className="btn-secondary btn-sm"
              onClick={() => navigate('/builder/jeopardy')}
            >
              Quiz-Builder öffnen
            </button>
            <button
              className="btn-secondary btn-sm"
              onClick={() => navigate('/library')}
            >
              Bibliothek
            </button>
          </div>
        </div>

        {/* Players */}
        <div className="lobby-players-card">
          <div className="lobby-section-header">
            <h2>
              Spieler <span className="lobby-player-count">({connectedPlayers.length})</span>
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-secondary btn-sm"
                onClick={shuffle}
                disabled={orderedPlayers.length < 2}
              >
                🎲 Zufällig
              </button>
            </div>
          </div>

          {orderedPlayers.length === 0 ? (
            <div className="empty-state">
              <p>Warte auf Spieler… Teile den Room-Code!</p>
            </div>
          ) : (
            <div className="player-list">
              {orderedPlayers.map((player, index) => (
                <div
                  key={player.id}
                  className={`player-item ${!player.connected ? 'disconnected' : ''} ${dragIndex === index ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => onDragStart(index)}
                  onDragOver={(e) => onDragOver(e, index)}
                  onDragEnd={onDragEnd}
                >
                  <span className="drag-handle">⠿</span>
                  <div className="player-avatar">{player.name[0]}</div>
                  <span className="player-rank">#{index + 1}</span>
                  <span className="player-name">{player.name}</span>
                  {player.connected ? (
                    <span className="player-online-badge">
                      <span className="player-online-dot" />
                      online
                    </span>
                  ) : (
                    <span className="player-offline-badge">offline</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="lobby-drag-hint">Reihenfolge per Drag & Drop anpassen</div>
        </div>

        <button
          className="btn-success btn-lg"
          onClick={startGame}
          disabled={connectedPlayers.length === 0 || starting || !isLobbyPhase || board.length === 0}
          style={{ width: '100%', boxShadow: '0 4px 20px rgba(22,163,74,0.3)' }}
        >
          {starting ? 'Starte…' : board.length === 0 ? 'Kein Quiz geladen' : `Spiel starten (${connectedPlayers.length} Spieler)`}
        </button>
      </div>
    </div>
  );
}
