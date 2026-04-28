import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { connect } from '../ws/socket';
import { useGameStore } from '../store/gameStore';

const API = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}`;

export default function JoinPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setIdentity = useGameStore((s) => s.setIdentity);

  const [code, setCode] = useState(() =>
    (searchParams.get('room') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  );
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (code.length === 6) nameRef.current?.focus();
    else codeRef.current?.focus();
  }, []);

  const codeOk = code.length === 6;
  const nameOk = name.trim().length > 0;

  const codeBorder = codeOk
    ? `2px solid var(--success)`
    : code ? `2px solid var(--primary)` : `2px solid var(--border)`;
  const codeBoxShadow = codeOk
    ? `0 0 0 3px rgba(34,197,94,0.15)`
    : code ? `0 0 0 3px rgba(79,110,247,0.15)` : 'none';
  const nameBorder = nameOk ? `2px solid var(--primary)` : `2px solid var(--border)`;
  const nameBoxShadow = nameOk ? `0 0 0 3px rgba(79,110,247,0.15)` : 'none';

  async function submit() {
    if (!codeOk) { setErr('Room-Code muss genau 6 Zeichen lang sein'); return; }
    if (!nameOk) { setErr('Bitte gib deinen Namen ein'); return; }
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`${API}/api/rooms/${code}`);
      if (!res.ok) { setErr('Room nicht gefunden'); return; }
      setIdentity('', name.trim());
      connect(code, name.trim());
      navigate('/waiting');
    } catch {
      setErr('Verbindung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="join-page">
      <div className="join-card">
        <div className="join-brand">
          <div className="join-brand-logo">
            <span className="join-brand-icon">⚡</span>BrainStorm
          </div>
          <div className="join-brand-subtitle">Gib deinen Room-Code und Namen ein</div>
        </div>

        <div className="join-form">
          <div>
            <div className="join-field-label">ROOM-CODE</div>
            <input
              ref={codeRef}
              className="join-code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="A3X9KL"
              maxLength={6}
              style={{ border: codeBorder, boxShadow: codeBoxShadow }}
            />
            <div className="join-code-dots">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`join-code-dot ${i < code.length ? 'filled' : 'empty'}`} />
              ))}
            </div>
          </div>

          <div>
            <div className="join-field-label">DEIN NAME</div>
            <input
              ref={nameRef}
              className="join-name-input"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 20))}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Wie soll dich das Spiel nennen?"
              style={{ border: nameBorder, boxShadow: nameBoxShadow }}
            />
          </div>

          {err && <div className="join-error">{err}</div>}

          <button
            className={`join-submit ${loading ? 'loading' : 'ready'}`}
            onClick={submit}
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="join-spinner" />
                Verbinde…
              </>
            ) : (
              'Beitreten'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
