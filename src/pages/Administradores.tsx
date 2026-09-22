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
    <>
      <div className="page-head">
        <div>
          <h1>Administradores</h1>
          <p>Contas com acesso ao backoffice.</p>
        </div>
      </div>

      <div className="card form" style={{ maxWidth: 420, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16 }}>Criar novo administrador</h3>
        <form onSubmit={handleCreate} className="form">
          <div className="f">
            <label>Nome</label>
            <input required value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="f">
            <label>Email</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="f">
            <label>Palavra-passe (mín. 6 caracteres)</label>
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-red" type="submit" disabled={creating} style={{ justifySelf: 'start' }}>
            {creating ? 'A criar…' : 'Criar conta'}
          </button>
          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          {success && <p style={{ color: 'var(--green)', fontSize: 13 }}>{success}</p>}
        </form>
      </div>

      <div className="table-wrap" style={{ maxWidth: 560 }}>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={2}>
                  <div className="empty">A carregar…</div>
                </td>
              </tr>
            ) : (
              admins.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{a.nome}</b>
                  </td>
                  <td>{a.email}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
