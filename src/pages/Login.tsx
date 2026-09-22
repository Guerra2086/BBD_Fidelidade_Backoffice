import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await signInWithMagicLink(email);
    if (error) setError(error);
    else setSent(true);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--paper)' }}>
      <div className="card-panel" style={{ width: 360 }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Backoffice — Segunda Vida</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
          Acesso reservado à equipa do Banco de Bens Doados.
        </p>
        {sent ? (
          <p>Enviámos um link de acesso para <strong>{email}</strong>. Verifica o teu email.</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
            <input
              type="email"
              required
              placeholder="o.teu@entrajuda.pt"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)' }}
            />
            <button className="btn btn-red" type="submit">
              Enviar link de acesso
            </button>
            {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
