import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ICON_KEYS } from '../lib/icons';
import type { Category, Product } from '../types';

const ESTADOS = ['Novo', 'Como novo', 'Bom'] as const;

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

type FormState = {
  id?: string;
  nome: string;
  category_id: string;
  descricao: string;
  preco: string;
  estado: (typeof ESTADOS)[number];
  icone: string;
  peso_kg: string;
  stock: string;
  destaque_novo: boolean;
  ativo: boolean;
  imagem_url: string | null;
};

const EMPTY_FORM: FormState = {
  nome: '',
  category_id: '',
  descricao: '',
  preco: '',
  estado: 'Novo',
  icone: ICON_KEYS[0],
  peso_kg: '',
  stock: '0',
  destaque_novo: false,
  ativo: true,
  imagem_url: null,
};

export function Produtos() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editing, setEditing] = useState<FormState | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('ordem');
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('nome');
      if (error) throw error;
      return data as Product[];
    },
  });

  const categoryNome = (id: string | null) => categories.find((c) => c.id === id)?.nome ?? '—';

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          p.nome.toLowerCase().includes(search.toLowerCase()) &&
          (!categoryFilter || p.category_id === categoryFilter),
      ),
    [products, search, categoryFilter],
  );

  const stockMutation = useMutation({
    mutationFn: async ({ id, stock }: { id: string; stock: number }) => {
      const { error } = await supabase.from('products').update({ stock: Math.max(0, stock) }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const saveMutation = useMutation({
    mutationFn: async (form: FormState) => {
      let imagem_url = form.imagem_url;
      if (imageFile) {
        const path = `${Date.now()}-${imageFile.name}`;
        const { error: uploadError } = await supabase.storage.from('product-images').upload(path, imageFile, {
          upsert: true,
        });
        if (uploadError) throw uploadError;
        imagem_url = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
      }

      const payload = {
        nome: form.nome,
        slug: slugify(form.nome),
        category_id: form.category_id || null,
        descricao: form.descricao || null,
        preco: Number(form.preco),
        estado: form.estado,
        icone: form.icone,
        peso_kg: Number(form.peso_kg) || 0,
        destaque_novo: form.destaque_novo,
        ativo: form.ativo,
        imagem_url,
      };

      if (form.id) {
        const { error } = await supabase.from('products').update(payload).eq('id', form.id);
        if (error) throw error;
      } else {
        const stock = Number(form.stock) || 0;
        const codigo_passaporte = `BBD-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;
        const { error } = await supabase.from('products').insert({ ...payload, stock, stock_inicial: stock, codigo_passaporte });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditing(null);
      setImageFile(null);
    },
    onError: (e: unknown) => setSaveError(e instanceof Error ? e.message : 'Erro ao guardar produto.'),
  });

  function openEdit(p?: Product) {
    setSaveError(null);
    setImageFile(null);
    if (p) {
      setEditing({
        id: p.id,
        nome: p.nome,
        category_id: p.category_id ?? '',
        descricao: p.descricao ?? '',
        preco: String(p.preco),
        estado: p.estado,
        icone: p.icone,
        peso_kg: String(p.peso_kg),
        stock: String(p.stock),
        destaque_novo: p.destaque_novo,
        ativo: p.ativo,
        imagem_url: p.imagem_url,
      });
    } else {
      setEditing({ ...EMPTY_FORM, category_id: categories[0]?.id ?? '' });
    }
  }

  return (
    <div className="page">
      <h1>Produtos</h1>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Pesquisar produto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', flex: 1, maxWidth: 280 }}
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)' }}
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <button className="btn btn-red" style={{ marginLeft: 'auto' }} onClick={() => openEdit()}>
          + Novo produto
        </button>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--muted)' }}>A carregar…</p>
      ) : (
        <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: 'var(--paper)' }}>
                {['Nome', 'Categoria', 'Preço', 'Stock', 'Estado', ''].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.nome}</td>
                  <td style={{ padding: '12px 16px' }}>{categoryNome(r.category_id)}</td>
                  <td style={{ padding: '12px 16px' }}>{r.preco} €</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => stockMutation.mutate({ id: r.id, stock: r.stock - 1 })}>
                        −
                      </button>
                      <span className={`badge ${r.stock === 0 ? 'muted' : r.stock <= 3 ? 'warn' : 'ok'}`}>
                        {r.stock === 0 ? 'Esgotado' : `${r.stock} un.`}
                      </span>
                      <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => stockMutation.mutate({ id: r.id, stock: r.stock + 1 })}>
                        +
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className={`badge ${r.ativo ? 'ok' : 'muted'}`}>{r.ativo ? 'Ativo' : 'Inativo'}</span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button className="btn btn-ghost" onClick={() => openEdit(r)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <>
          <div className="bo-scrim" onClick={() => setEditing(null)} />
          <aside className="bo-drawer">
            <div className="bo-drawer-head">
              <h3>{editing.id ? 'Editar produto' : 'Novo produto'}</h3>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>
                ×
              </button>
            </div>
            <div className="bo-drawer-body">
              <div className="bo-field">
                <label>Nome</label>
                <input value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} />
              </div>
              <div className="bo-row">
                <div className="bo-field">
                  <label>Categoria</label>
                  <select value={editing.category_id} onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bo-field">
                  <label>Estado</label>
                  <select value={editing.estado} onChange={(e) => setEditing({ ...editing, estado: e.target.value as FormState['estado'] })}>
                    {ESTADOS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="bo-field">
                <label>Descrição</label>
                <textarea rows={3} value={editing.descricao} onChange={(e) => setEditing({ ...editing, descricao: e.target.value })} />
              </div>
              <div className="bo-row">
                <div className="bo-field">
                  <label>Preço (€)</label>
                  <input type="number" min={0} step="0.01" value={editing.preco} onChange={(e) => setEditing({ ...editing, preco: e.target.value })} />
                </div>
                <div className="bo-field">
                  <label>Peso (kg)</label>
                  <input type="number" min={0} step="0.1" value={editing.peso_kg} onChange={(e) => setEditing({ ...editing, peso_kg: e.target.value })} />
                </div>
              </div>
              <div className="bo-row">
                <div className="bo-field">
                  <label>Ícone</label>
                  <select value={editing.icone} onChange={(e) => setEditing({ ...editing, icone: e.target.value })}>
                    {ICON_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
                {!editing.id && (
                  <div className="bo-field">
                    <label>Stock inicial</label>
                    <input type="number" min={0} value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: e.target.value })} />
                  </div>
                )}
              </div>
              <div className="bo-field">
                <label>Imagem (opcional — substitui o ícone)</label>
                <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
                {editing.imagem_url && !imageFile && <img src={editing.imagem_url} alt="" style={{ maxWidth: 120, borderRadius: 8 }} />}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={editing.destaque_novo} onChange={(e) => setEditing({ ...editing, destaque_novo: e.target.checked })} />
                Destacar como "Chegou hoje"
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={editing.ativo} onChange={(e) => setEditing({ ...editing, ativo: e.target.checked })} />
                Ativo na loja
              </label>
              {saveError && <p style={{ color: 'var(--red)', fontSize: 13 }}>{saveError}</p>}
            </div>
            <div className="bo-drawer-foot">
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button
                className="btn btn-red"
                disabled={saving || !editing.nome || !editing.preco}
                onClick={async () => {
                  setSaving(true);
                  await saveMutation.mutateAsync(editing);
                  setSaving(false);
                }}
              >
                {saving ? 'A guardar…' : 'Guardar'}
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
