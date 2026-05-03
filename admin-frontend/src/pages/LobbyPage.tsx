import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useLobbyStore } from '../store/lobbyStore';
import type { ToastType } from '../App';
import BoardPreview from '../components/BoardPreview';
import { API, apiFetch } from '../api/client';

interface Props {
  toast: (msg: string, type?: ToastType) => void;
}

export default function LobbyPage({ toast }: Props) {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const { players, playerOrder, roomPhase, board, handleMessage } = useGameStore();
  const { setActiveRoom } = useLobbyStore();

  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!code) return;
    setActiveRoom(code);

    async function loadRoom() {
      const res = await apiFetch(`${API}/api/rooms/${code}`);
      if (!res.ok) {
        toast('Room nicht gefunden', 'error');
        navigate('/');
        return;
      }
      const snap = await res.json();
      handleMessage({ type: 'GAME_STATE', payload: snap });
    }
    loadRoom();
  }, [code]);  // eslint-disable-line react-hooks/exhaustive-deps

  const connectedPlayers = players.filter((p) => p.connected);
  const orderedPlayers = playerOrder
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean) as typeof players;

  function copyCode() {
    if (!code) return;
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast('Room-Code kopiert!', 'success');
  }

  async function shuffle() {
    await apiFetch(`${API}/api/rooms/${code}/players/shuffle`, { method: 'POST' });
  }

  async function kickPlayer(playerId: string, playerName: string) {
    if (!confirm(`"${playerName}" wirklich kicken?`)) return;
    try {
      const res = await apiFetch(`${API}/api/rooms/${code}/players/${playerId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || 'Kick fehlgeschlagen', 'error');
      }
    } catch (e) {
      toast(String(e), 'error');
    }
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
    await apiFetch(`${API}/api/rooms/${code}/players/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playerOrder),
    });
  }

  async function startGame() {
    if (connectedPlayers.length === 0) return;
    setStarting(true);
    try {
      const res = await apiFetch(`${API}/api/rooms/${code}/start`, { method: 'POST' });
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

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn-secondary btn-sm" onClick={() => navigate('/')}>
            ← Zurück
          </button>
          <button
            className={copied ? 'btn-success btn-sm' : 'btn-secondary btn-sm'}
            onClick={copyCode}
          >
            {copied ? '✓ Code kopiert' : 'Code kopieren'}
          </button>
        </div>

        {/* Quiz */}
        <div className="lobby-players-card">
          <div className="lobby-section-header">
            <h2>Quiz</h2>
            <button
              className="btn-secondary btn-sm"
              onClick={() => navigate('/library')}
            >
              Quiz-Bibliothek
            </button>
          </div>
          <BoardPreview categories={board} />
        </div>

        {/* Players */}
        <div className="lobby-players-card">
          <div className="lobby-section-header">
            <h2>
              Spieler <span className="lobby-player-count">({connectedPlayers.length})</span>
            </h2>
            <button
              className="btn-secondary btn-sm"
              onClick={shuffle}
              disabled={orderedPlayers.length < 2}
            >
              🎲 Zufällig
            </button>
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
                  <button
                    className="active-room-close"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => kickPlayer(player.id, player.name)}
                    title="Spieler kicken"
                  >
                    ✕
                  </button>
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
