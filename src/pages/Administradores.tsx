import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { callAdminApi } from '../lib/api';

type Profile = { id: string; nome: string; email: string; created_at: string };

export function Administradores() {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: admins = [], isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, nome, email, created_at').order('created_at');
      if (error) throw error;
      return data as Profile[];
    },
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreating(true);
    try {
      await callAdminApi('admin-create-user', { nome, email, password });
      setSuccess(`Conta criada para ${email} ✓`);
      setNome('');
      setEmail('');
      setPassword('');
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar a conta.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page">
      <h1>Administradores</h1>

      <div className="card-panel" style={{ maxWidth: 420, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Criar novo administrador</h3>
        <form onSubmit={handleCreate} style={{ display: 'grid', gap: 10 }}>
          <input
            required
            placeholder="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)' }}
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)' }}
          />
          <input
            required
            type="password"
            placeholder="Palavra-passe (mín. 6 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)' }}
          />
          <button className="btn btn-red" type="submit" disabled={creating} style={{ justifySelf: 'start' }}>
            {creating ? 'A criar…' : 'Criar conta'}
          </button>
          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          {success && <p style={{ color: 'var(--ok)', fontSize: 13 }}>{success}</p>}
        </form>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--muted)' }}>A carregar…</p>
      ) : (
        <div className="card-panel" style={{ padding: 0, overflow: 'hidden', maxWidth: 560 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: 'var(--paper)' }}>
                <th style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>Nome</th>
                <th style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>Email</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{a.nome}</td>
                  <td style={{ padding: '12px 16px' }}>{a.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
