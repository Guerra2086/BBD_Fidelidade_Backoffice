import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon } from '../lib/icons';
import { Modal, ConfirmDialog } from '../components/Modal';
import { Pagination, paginate } from '../components/Pagination';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { callAdminApi } from '../lib/api';

type Profile = {
  id: string;
  nome: string;
  email: string;
  created_at: string;
  blocked: boolean;
  banned: boolean;
  must_change_password: boolean;
};

const PAGE_SIZE = 10;

function StatusPill({ p }: { p: Profile }) {
  if (p.banned) return <span className="pill red">Banido</span>;
  if (p.blocked) return <span className="pill amber">Bloqueado</span>;
  if (p.must_change_password) return <span className="pill blue">Por trocar a palavra-passe</span>;
  return <span className="pill green">Ativo</span>;
}

export function Administradores() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { session } = useAuth();
  const myId = session?.user.id;

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState<{ nome: string; email: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; nome: string } | null>(null);
  const [resetting, setResetting] = useState<Profile | null>(null);
  const [banning, setBanning] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);

  const { data: admins = [], isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, email, created_at, blocked, banned, must_change_password')
        .order('created_at');
      if (error) throw error;
      return data as Profile[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter((a) => a.nome.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [admins, search]);

  useEffect(() => setPage(1), [search]);
  const { pageItems, totalPages, safePage } = paginate(filtered, page, PAGE_SIZE);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['profiles'] });
  }

  const createMutation = useMutation({
    mutationFn: async (form: { nome: string; email: string }) => callAdminApi('admin-create-user', form),
    onSuccess: (_d, form) => {
      invalidate();
      setCreating(null);
      toast('Conta criada', 'ok', `Enviámos a palavra-passe inicial para ${form.email}`);
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Não foi possível criar a conta.', 'err'),
  });

  const renameMutation = useMutation({
    mutationFn: async (form: { id: string; nome: string }) => {
      const { error } = await supabase.from('profiles').update({ nome: form.nome }).eq('id', form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setRenaming(null);
      toast('Nome atualizado', 'ok');
    },
    onError: () => toast('Não foi possível mudar o nome.', 'err'),
  });

  const blockMutation = useMutation({
    mutationFn: async (p: Profile) => {
      const { error } = await supabase.from('profiles').update({ blocked: !p.blocked }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: (_d, p) => {
      invalidate();
      toast(p.blocked ? 'Acesso desbloqueado' : 'Acesso bloqueado', 'ok');
    },
    onError: () => toast('Não foi possível alterar o bloqueio.', 'err'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (p: Profile) => callAdminApi('admin-reset-password', { userId: p.id }),
    onSuccess: (_d, p) => {
      invalidate();
      setResetting(null);
      toast('Palavra-passe reposta', 'ok', `Enviámos a nova palavra-passe para ${p.email}`);
    },
    onError: () => toast('Não foi possível repor a palavra-passe.', 'err'),
  });

  const banMutation = useMutation({
    mutationFn: async (p: Profile) => callAdminApi('admin-toggle-ban', { userId: p.id, banned: !p.banned }),
    onSuccess: (_d, p) => {
      invalidate();
      setBanning(null);
      toast(p.banned ? 'Utilizador desbanido' : 'Utilizador banido', 'ok');
    },
    onError: () => toast('Não foi possível alterar o banimento.', 'err'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (p: Profile) => callAdminApi('admin-delete-user', { userId: p.id }),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast('Conta eliminada', 'ok');
    },
    onError: () => toast('Não foi possível eliminar a conta.', 'err'),
  });

  function openCreate() {
    setCreating({ nome: '', email: '' });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!creating) return;
    if (!creating.nome.trim() || !creating.email.trim()) return toast('Preenche o nome e o email.', 'err');
    createMutation.mutate(creating);
  }

  function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    if (!renaming.nome.trim()) return toast('Indica o nome.', 'err');
    renameMutation.mutate(renaming);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Administradores</h1>
          <p>Contas com acesso ao backoffice. Todas as contas criadas aqui são administradores.</p>
        </div>
        <div className="actions">
          <button className="btn btn-red" onClick={openCreate}>
            <Icon name="plus" />
            Criar utilizador
          </button>
        </div>
      </div>

      <div className="toolbar">
        <label className="field-inline" style={{ flex: 1, minWidth: 220, maxWidth: 360 }}>
          <Icon name="search" />
          <input placeholder="Pesquisar por nome ou email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Estado</th>
              <th>Criado em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty">A carregar…</div>
                </td>
              </tr>
            ) : pageItems.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty">Sem utilizadores para "{search}".</div>
                </td>
              </tr>
            ) : (
              pageItems.map((a) => {
                const isSelf = a.id === myId;
                return (
                  <tr key={a.id}>
                    <td>
                      <b>{a.nome}</b>
                      {isSelf && (
                        <span style={{ color: 'var(--muted)', fontWeight: 400 }}> (tu)</span>
                      )}
                    </td>
                    <td>{a.email}</td>
                    <td>
                      <StatusPill p={a} />
                    </td>
                    <td>{new Date(a.created_at).toLocaleDateString('pt-PT')}</td>
                    <td>
                      <div className="row-actions">
                        <button title="Mudar nome" onClick={() => setRenaming({ id: a.id, nome: a.nome })}>
                          <Icon name="edit" />
                        </button>
                        <button title="Repor palavra-passe" onClick={() => setResetting(a)}>
                          <Icon name="send" />
                        </button>
                        <button
                          title={a.blocked ? 'Desbloquear acesso' : 'Bloquear acesso'}
                          className={a.blocked ? 'active' : ''}
                          disabled={isSelf}
                          onClick={() => blockMutation.mutate(a)}
                        >
                          <Icon name="lock" />
                        </button>
                        <button
                          className={`del${a.banned ? ' active' : ''}`}
                          title={a.banned ? 'Desbanir' : 'Banir'}
                          disabled={isSelf}
                          onClick={() => setBanning(a)}
                        >
                          <Icon name="ban" />
                        </button>
                        <button className="del" title="Eliminar" disabled={isSelf} onClick={() => setDeleting(a)}>
                          <Icon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />

      <Modal
        open={!!creating}
        onClose={() => setCreating(null)}
        title="Criar utilizador"
        sub="É gerada e enviada por email uma palavra-passe inicial; a conta é criada como administrador."
        icon="user"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreating(null)}>
              Cancelar
            </button>
            <button className="btn btn-red" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'A criar…' : 'Criar conta'}
            </button>
          </>
        }
      >
        {creating && (
          <form className="form" onSubmit={handleCreate}>
            <div className="f">
              <label>Nome</label>
              <input required value={creating.nome} onChange={(e) => setCreating({ ...creating, nome: e.target.value })} />
            </div>
            <div className="f">
              <label>Email</label>
              <input required type="email" value={creating.email} onChange={(e) => setCreating({ ...creating, email: e.target.value })} />
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title="Mudar nome"
        icon="edit"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setRenaming(null)}>
              Cancelar
            </button>
            <button className="btn btn-red" onClick={handleRename} disabled={renameMutation.isPending}>
              Guardar
            </button>
          </>
        }
      >
        {renaming && (
          <form className="form" onSubmit={handleRename}>
            <div className="f">
              <label>Nome</label>
              <input required value={renaming.nome} onChange={(e) => setRenaming({ ...renaming, nome: e.target.value })} />
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!resetting}
        onClose={() => setResetting(null)}
        title="Repor palavra-passe?"
        ok="Repor e enviar"
        msg={
          <>
            Vai ser gerada uma nova palavra-passe e enviada para <b>{resetting?.email}</b>. Ao entrar, vai ser pedido para
            definir uma nova.
          </>
        }
        onYes={() => resetting && resetPasswordMutation.mutate(resetting)}
      />

      <ConfirmDialog
        open={!!banning}
        onClose={() => setBanning(null)}
        title={banning?.banned ? 'Desbanir utilizador?' : 'Banir utilizador?'}
        danger={!banning?.banned}
        ok={banning?.banned ? 'Desbanir' : 'Banir'}
        msg={
          banning?.banned ? (
            <>
              <b>{banning?.nome}</b> volta a poder entrar no backoffice.
            </>
          ) : (
            <>
              <b>{banning?.nome}</b> deixa de conseguir entrar no backoffice, mesmo com a palavra-passe certa.
            </>
          )
        }
        onYes={() => banning && banMutation.mutate(banning)}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Eliminar conta?"
        danger
        ok="Eliminar"
        msg={
          <>
            Vais eliminar a conta de <b>{deleting?.nome}</b> ({deleting?.email}). Esta ação não pode ser anulada.
          </>
        }
        onYes={() => deleting && deleteMutation.mutate(deleting)}
      />
    </>
  );
}
