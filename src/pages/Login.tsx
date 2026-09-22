import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const { signInWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signInWithPassword(email, password);
    setLoading(false);
    if (error) setError('Email ou palavra-passe incorretos.');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--paper)' }}>
      <div className="card" style={{ width: 360 }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Backoffice — Segunda Vida</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
          Acesso reservado à equipa do Banco de Bens Doados.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <input
            type="email"
            required
            autoComplete="username"
            placeholder="o.teu@entrajuda.pt"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)' }}
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Palavra-passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)' }}
          />
          <button className="btn btn-red" type="submit" disabled={loading}>
            {loading ? 'A entrar…' : 'Entrar'}
          </button>
          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
        </form>
      </div>
    </div>
  );
}
