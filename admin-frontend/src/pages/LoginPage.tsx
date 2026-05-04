import { useState } from 'react';
import bcrypt from 'bcryptjs';

interface Props {
  onAuth: () => void;
}

// Hash is base64-encoded to survive Vite's dotenv-expand ($-sign stripping)
const HASH_B64 = import.meta.env.VITE_ADMIN_PASSWORD_HASH as string | undefined;
const HASH = HASH_B64 ? atob(HASH_B64) : undefined;

export const LOGIN_REQUIRED = !!HASH;

export default function LoginPage({ onAuth }: Props) {
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!HASH) { onAuth(); return; }
    setChecking(true);
    const ok = await bcrypt.compare(pass, HASH);
    setChecking(false);
    if (ok) {
      onAuth();
    } else {
      setError(true);
      setPass('');
      setTimeout(() => setError(false), 1500);
    }
  }

  return (
    <div className="pin-gate">
      <div className="pin-card">
        <div className="pin-icon">⚡</div>
        <h1 className="pin-title">Game Admin</h1>
        <p className="pin-subtitle">Anmelden</p>
        <form onSubmit={submit} className="pin-form">
          <input
            className="pin-input"
            type="text"
            autoComplete="username"
            value="admin"
            readOnly
            style={{ color: 'var(--text-muted)', cursor: 'default' }}
          />
          <div className="pin-pass-wrap">
            <input
              className={`pin-input ${error ? 'pin-input--error' : ''}`}
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Passwort"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoFocus
              disabled={checking}
            />
            <button
              type="button"
              className="pin-show-btn"
              onClick={() => setShowPass((s) => !s)}
              tabIndex={-1}
              title={showPass ? 'Passwort verbergen' : 'Passwort anzeigen'}
            >
              {showPass ? '🙈' : '👁'}
            </button>
          </div>
          {error && <div className="pin-error">Falsches Passwort</div>}
          <button className="btn-primary btn-lg" type="submit" style={{ width: '100%' }} disabled={checking}>
            {checking ? 'Prüfe…' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  );
}
