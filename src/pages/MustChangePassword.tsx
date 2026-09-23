import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function MustChangePassword() {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('A palavra-passe deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As palavras-passe não coincidem.');
      return;
    }
    setSaving(true);
    const { error } = await updatePassword(password);
    setSaving(false);
    if (error) setError('Não foi possível guardar a nova palavra-passe.');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--paper)' }}>
      <div className="card" style={{ width: 380 }}>
        <h1 style={{ fontSize: 20, marginBottom: 6 }}>Define uma nova palavra-passe</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
          Por segurança, tens de escolher uma palavra-passe nova antes de continuar.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
            Nova palavra-passe
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit', fontWeight: 400, color: 'var(--ink)' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
            Confirmar palavra-passe
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit', fontWeight: 400, color: 'var(--ink)' }}
            />
          </label>
          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          <button className="btn btn-red" type="submit" disabled={saving}>
            {saving ? 'A guardar…' : 'Guardar e entrar'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
