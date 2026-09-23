import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const { signInWithPassword, loginPhase } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const checking = loginPhase === 'checking';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (checking) return;
    await signInWithPassword(email, password);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--paper)' }}>
      <div className="card" style={{ width: 360 }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Backoffice — Segunda Vida</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
          Acesso reservado à equipa do Banco de Bens Doados.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
            Email
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="o.teu@entrajuda.pt"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit', fontWeight: 400, color: 'var(--ink)' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
            Palavra-passe
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="Palavra-passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit', fontWeight: 400, color: 'var(--ink)' }}
            />
          </label>
          <button className="btn btn-red" type="submit" disabled={checking}>
            {checking ? 'A entrar…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
