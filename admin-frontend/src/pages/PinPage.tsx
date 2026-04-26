import { useState } from 'react';

interface Props {
  onAuth: () => void;
}

export default function PinPage({ onAuth }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin === import.meta.env.VITE_ADMIN_PIN) {
      sessionStorage.setItem('admin_auth', '1');
      onAuth();
    } else {
      setError(true);
      setPin('');
      setTimeout(() => setError(false), 1500);
    }
  }

  return (
    <div className="pin-gate">
      <div className="pin-card">
        <div className="pin-icon">⚡</div>
        <h1 className="pin-title">BrainStorm Admin</h1>
        <p className="pin-subtitle">PIN eingeben</p>
        <form onSubmit={submit} className="pin-form">
          <input
            className={`pin-input ${error ? 'pin-input--error' : ''}`}
            type="password"
            inputMode="numeric"
            maxLength={8}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          {error && <div className="pin-error">Falscher PIN</div>}
          <button className="btn-primary btn-lg" type="submit" style={{ width: '100%' }}>
            Entsperren
          </button>
        </form>
      </div>
    </div>
  );
}
