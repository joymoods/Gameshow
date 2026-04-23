import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';

const API = `http://${window.location.hostname}:8080`;

export default function LobbyPage() {
  const navigate = useNavigate();
  const { roomCode, players, playerOrder } = useGameStore();
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const connectedPlayers = players.filter((p) => p.connected);
  const orderedPlayers = playerOrder
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean) as typeof players;

  function copyCode() {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shuffle() {
    await fetch(`${API}/api/rooms/${roomCode}/players/shuffle`, { method: 'POST' });
  }

  // Simple drag-and-drop reorder
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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
    await fetch(`${API}/api/rooms/${roomCode}/players/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playerOrder),
    });
  }

  async function startGame() {
    if (connectedPlayers.length === 0) return;
    setStarting(true);
    try {
      const res = await fetch(`${API}/api/rooms/${roomCode}/start`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Fehler beim Starten');
        return;
      }
      navigate('/control');
    } finally {
      setStarting(false);
    }
  }

  if (!roomCode) {
    return (
      <div className="page">
        <p>Kein aktiver Room. <a href="/">Zurück zum Builder</a></p>
      </div>
    );
  }

  return (
    <div className="page lobby-page">
      <header className="page-header">
        <h1>Lobby</h1>
        <button
          className="btn-success"
          onClick={startGame}
          disabled={connectedPlayers.length === 0 || starting}
        >
          {starting ? 'Starte…' : `Spiel starten (${connectedPlayers.length} Spieler)`}
        </button>
      </header>

      {/* Room Code */}
      <div className="room-code-box">
        <p className="label">Room-Code</p>
        <div className="room-code">{roomCode}</div>
        <button className="btn-secondary" onClick={copyCode}>
          {copied ? '✓ Kopiert!' : '📋 Kopieren'}
        </button>
        <p className="hint">Spieler gehen auf die Spieler-App und geben diesen Code ein.</p>
      </div>

      {/* Player list */}
      <div className="lobby-players">
        <div className="section-header">
          <h2>Spieler ({connectedPlayers.length})</h2>
          <button className="btn-secondary btn-sm" onClick={shuffle} disabled={orderedPlayers.length < 2}>
            🎲 Reihenfolge würfeln
          </button>
        </div>

        {orderedPlayers.length === 0 ? (
          <div className="empty-state">
            <p>Warte auf Spieler… Teile den Room-Code!</p>
          </div>
        ) : (
          <ul className="player-order-list">
            {orderedPlayers.map((player, index) => (
              <li
                key={player.id}
                className={`player-item ${!player.connected ? 'disconnected' : ''} ${dragIndex === index ? 'dragging' : ''}`}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDragEnd={onDragEnd}
              >
                <span className="drag-handle">⠿</span>
                <span className="turn-number">{index + 1}.</span>
                <span className="player-name">{player.name}</span>
                {!player.connected && <span className="badge-disconnected">offline</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
