import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon } from '../lib/icons';
import { Modal } from '../components/Modal';
import { useToast } from '../context/ToastContext';
import { slugify } from '../lib/text';
import type { Category, Product, Tag } from '../types';

export function Categorias() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<{ id?: string; nome: string; limitOn: boolean; limite: string } | null>(null);
  const [managingTagsFor, setManagingTagsFor] = useState<Category | null>(null);
  const [novaTagNome, setNovaTagNome] = useState('');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagNome, setEditingTagNome] = useState('');

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('ordem');
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('*').order('ordem');
      if (error) throw error;
      return data as Tag[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data as Product[];
    },
  });

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; stock: number }>();
    for (const p of products) {
      const cur = map.get(p.category_id ?? '') ?? { count: 0, stock: 0 };
      cur.count += 1;
      cur.stock += p.stock;
      map.set(p.category_id ?? '', cur);
    }
    return map;
  }, [products]);

  const tagsByCategory = (categoryId: string) => tags.filter((t) => t.category_id === categoryId);

  const tagSaveMutation = useMutation({
    mutationFn: async ({ categoryId, nome }: { categoryId: string; nome: string }) => {
      const { error } = await supabase
        .from('tags')
        .insert({ category_id: categoryId, nome, slug: slugify(nome), ordem: tagsByCategory(categoryId).length + 1 });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setNovaTagNome('');
      toast('Etiqueta criada', 'ok');
    },
    onError: () => toast('Não foi possível criar a etiqueta (nome já existe nesta categoria?)', 'err'),
  });

  const tagRenameMutation = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase.from('tags').update({ nome, slug: slugify(nome) }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setEditingTagId(null);
      toast('Etiqueta atualizada', 'ok');
    },
    onError: () => toast('Não foi possível atualizar a etiqueta', 'err'),
  });

  const tagDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast('Etiqueta apagada');
    },
    onError: () => toast('Não foi possível apagar a etiqueta', 'err'),
  });

  const saveMutation = useMutation({
    mutationFn: async (form: NonNullable<typeof editing>) => {
      const limite_unidades = form.limitOn ? Number(form.limite) : null;
      if (form.id) {
        const { error } = await supabase.from('categories').update({ nome: form.nome, limite_unidades }).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('categories').insert({ nome: form.nome, slug: form.nome.toLowerCase().replace(/\s+/g, '-'), ordem: categories.length + 1, limite_unidades });
        if (error) throw error;
      }
    },
    onSuccess: (_d, form) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setEditing(null);
      toast('Categoria guardada', 'ok', form.limitOn ? `Limite: ${form.limite} un. por encomenda` : 'Sem limite');
    },
    onError: () => toast('Não foi possível guardar a categoria', 'err'),
  });

  function openEdit(c?: Category) {
    setEditing(c ? { id: c.id, nome: c.nome, limitOn: c.limite_unidades !== null, limite: String(c.limite_unidades ?? 1) } : { nome: '', limitOn: false, limite: '1' });
  }

  function handleSave() {
    if (!editing) return;
    if (!editing.nome.trim()) return toast('Indica o nome.', 'err');
    if (editing.limitOn && !(Number(editing.limite) >= 1)) return toast('Mínimo 1.', 'err');
    saveMutation.mutate(editing);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Categorias e limites</h1>
          <p>Limite de unidades por encomenda, aplicado na loja e validado no servidor.</p>
        </div>
        <div className="actions">
          <button className="btn btn-red" data-tour="categoria-nova-btn" onClick={() => openEdit()}>
            <Icon name="plus" />
            Nova categoria
          </button>
        </div>
      </div>

      <div className="table-wrap" data-tour="categoria-tabela">
        <table>
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Produtos</th>
              <th>Unidades em stock</th>
              <th>Limite por encomenda</th>
              <th>Etiquetas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => {
              const s = stats.get(c.id) ?? { count: 0, stock: 0 };
              const catTags = tagsByCategory(c.id);
              return (
                <tr key={c.id}>
                  <td>
                    <b>{c.nome}</b>
                  </td>
                  <td>{s.count}</td>
                  <td className="num">{s.stock}</td>
                  <td>
                    {c.limite_unidades ? (
                      <span className="pill red">Máx. {c.limite_unidades} unidade(s)</span>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>Sem limite</span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn-line" onClick={() => setManagingTagsFor(c)}>
                      <Icon name="tag" />
                      {catTags.length ? `${catTags.length} etiqueta(s)` : 'Gerir etiquetas'}
                    </button>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button title="Editar" onClick={() => openEdit(c)}>
                        <Icon name="edit" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Editar "${editing.nome}"` : 'Nova categoria'}
        icon="tag"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button className="btn btn-red" onClick={handleSave}>
              Guardar
            </button>
          </>
        }
      >
        {editing && (
          <div className="form">
            <div className="f">
              <label>Nome</label>
              <input value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} />
            </div>
            <div className="switch-row">
              <div>
                <b>Limitar quantidade por encomenda</b>
                <span>Ex.: Tecnologia — evita que um colaborador leve tudo</span>
              </div>
              <button type="button" className={`toggle ${editing.limitOn ? 'on' : ''}`} onClick={() => setEditing({ ...editing, limitOn: !editing.limitOn })}></button>
            </div>
            {editing.limitOn && (
              <div className="f">
                <label>Máximo de unidades desta categoria por encomenda</label>
                <input type="number" min={1} value={editing.limite} onChange={(e) => setEditing({ ...editing, limite: e.target.value })} />
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!managingTagsFor}
        onClose={() => setManagingTagsFor(null)}
        title={managingTagsFor ? `Etiquetas de "${managingTagsFor.nome}"` : ''}
        sub="Subdivisões da categoria, usadas como filtro na loja"
        icon="tag"
        footer={
          <button className="btn btn-ghost" onClick={() => setManagingTagsFor(null)}>
            Fechar
          </button>
        }
      >
        {managingTagsFor && (
          <div className="form">
            <ul className="simple-list">
              {tagsByCategory(managingTagsFor.id).map((t) => (
                <li key={t.id}>
                  {editingTagId === t.id ? (
                    <div className="input-suffix">
                      <input
                        autoFocus
                        value={editingTagNome}
                        onChange={(e) => setEditingTagNome(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && editingTagNome.trim() && tagRenameMutation.mutate({ id: t.id, nome: editingTagNome.trim() })}
                      />
                      <button type="button" className="btn btn-line" onClick={() => editingTagNome.trim() && tagRenameMutation.mutate({ id: t.id, nome: editingTagNome.trim() })}>
                        Guardar
                      </button>
                    </div>
                  ) : (
                    <>
                      <span>{t.nome}</span>
                      <div className="row-actions">
                        <button
                          title="Renomear"
                          onClick={() => {
                            setEditingTagId(t.id);
                            setEditingTagNome(t.nome);
                          }}
                        >
                          <Icon name="edit" />
                        </button>
                        <button title="Apagar" onClick={() => tagDeleteMutation.mutate(t.id)}>
                          <Icon name="trash" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
              {!tagsByCategory(managingTagsFor.id).length && <li style={{ color: 'var(--muted)' }}>Ainda sem etiquetas nesta categoria.</li>}
            </ul>
            <div className="input-suffix" style={{ marginTop: 10 }}>
              <input
                placeholder="Nome da nova etiqueta"
                value={novaTagNome}
                onChange={(e) => setNovaTagNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && novaTagNome.trim() && tagSaveMutation.mutate({ categoryId: managingTagsFor.id, nome: novaTagNome.trim() })}
              />
              <button
                type="button"
                className="btn btn-line"
                onClick={() => novaTagNome.trim() && tagSaveMutation.mutate({ categoryId: managingTagsFor.id, nome: novaTagNome.trim() })}
              >
                <Icon name="plus" />
                Adicionar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
