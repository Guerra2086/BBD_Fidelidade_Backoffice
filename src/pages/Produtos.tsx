import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon, ProductIcon, ICON_KEYS } from '../lib/icons';
import { Modal, ConfirmDialog } from '../components/Modal';
import { useToast } from '../context/ToastContext';
import { eur } from '../lib/orders';
import type { Category, Product } from '../types';

const ESTADOS = ['Novo', 'Como novo', 'Bom'] as const;
const MAXF = 6;

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stockLabel(stock: number, low: boolean) {
  if (stock === 0) return 'Esgotado';
  if (low) return 'Stock baixo';
  return 'Em stock';
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
  fotos: string[];
};

const EMPTY_FORM: FormState = {
  nome: '',
  category_id: '',
  descricao: '',
  preco: '',
  estado: 'Novo',
  icone: ICON_KEYS[0],
  peso_kg: '',
  stock: '1',
  destaque_novo: false,
  ativo: true,
  fotos: [],
};

export function Produtos() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editing, setEditing] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxFor, setLightboxFor] = useState<{ fotos: string[]; index: number; nome: string } | null>(null);

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
  const categoryLimite = (id: string | null) => categories.find((c) => c.id === id)?.limite_unidades ?? null;

  function openEdit(p?: Product) {
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
        fotos: [...p.fotos],
      });
    } else {
      setEditing({ ...EMPTY_FORM, category_id: categories[0]?.id ?? '' });
    }
  }

  useEffect(() => {
    const editId = params.get('edit');
    if (editId && products.length) {
      const p = products.find((x) => x.id === editId);
      if (p) openEdit(p);
      params.delete('edit');
      setParams(params, { replace: true });
    }
    if (params.get('new')) {
      openEdit();
      params.delete('new');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const filtered = useMemo(
    () => products.filter((p) => (!search || p.nome.toLowerCase().includes(search.toLowerCase())) && (!categoryFilter || p.category_id === categoryFilter)),
    [products, search, categoryFilter],
  );

  const stockMutation = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: number }) => {
      const { error } = await supabase.rpc('adjust_stock', { p_product_id: id, p_delta: delta, p_motivo: 'Ajuste manual' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
    },
    onError: () => toast('Não foi possível ajustar o stock', 'err'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('products').update({ ativo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast(vars.ativo ? 'Produto visível na loja' : 'Produto escondido da loja');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast('Produto apagado');
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (form: FormState) => {
      const payload = {
        nome: form.nome,
        slug: slugify(form.nome) + '-' + Math.random().toString(36).slice(2, 6),
        category_id: form.category_id || null,
        descricao: form.descricao || null,
        preco: Number(form.preco),
        estado: form.estado,
        icone: form.icone,
        peso_kg: Number(form.peso_kg) || 0,
        destaque_novo: form.destaque_novo,
        ativo: form.ativo,
        fotos: form.fotos,
      };
      if (form.id) {
        const { slug: _slug, ...updatePayload } = payload;
        const { error } = await supabase.from('products').update(updatePayload).eq('id', form.id);
        if (error) throw error;
      } else {
        const stock = Number(form.stock) || 0;
        const codigo_passaporte = `BBD-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;
        const { error } = await supabase.from('products').insert({ ...payload, stock, stock_inicial: stock, codigo_passaporte });
        if (error) throw error;
      }
    },
    onSuccess: (_d, form) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditing(null);
      toast(form.id ? 'Alterações guardadas' : 'Produto criado', 'ok', form.id ? undefined : `${form.nome} · ${form.stock} un.`);
    },
    onError: () => toast('Não foi possível guardar o produto', 'err'),
  });

  async function addFiles(files: FileList | File[]) {
    if (!editing) return;
    const list = [...files];
    let skipped = 0;
    const next = [...editing.fotos];
    setUploading(true);
    for (const f of list) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
        toast(`${f.name}: formato não suportado`, 'err');
        continue;
      }
      if (f.size > 5 * 1024 * 1024) {
        toast(`${f.name}: maior que 5 MB`, 'err');
        continue;
      }
      if (next.length >= MAXF) {
        skipped++;
        continue;
      }
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name}`;
      const { error } = await supabase.storage.from('product-images').upload(path, f);
      if (error) {
        toast(`Erro ao enviar ${f.name}`, 'err');
        continue;
      }
      next.push(supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl);
    }
    if (skipped) toast(`Máximo de ${MAXF} fotografias por produto`, 'err');
    setUploading(false);
    setEditing((prev) => (prev ? { ...prev, fotos: next } : prev));
  }

  function moveFoto(k: number, d: number) {
    setEditing((prev) => {
      if (!prev) return prev;
      const fotos = [...prev.fotos];
      [fotos[k], fotos[k + d]] = [fotos[k + d], fotos[k]];
      return { ...prev, fotos };
    });
  }
  function makeCover(k: number) {
    setEditing((prev) => {
      if (!prev) return prev;
      const fotos = [...prev.fotos];
      fotos.unshift(fotos.splice(k, 1)[0]);
      return { ...prev, fotos };
    });
    toast('Nova capa definida');
  }
  function removeFoto(k: number) {
    setEditing((prev) => {
      if (!prev) return prev;
      const fotos = [...prev.fotos];
      fotos.splice(k, 1);
      return { ...prev, fotos };
    });
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.nome.trim()) return toast('Indica o nome do produto.', 'err');
    if (editing.preco === '' || +editing.preco < 0) return toast('Preço inválido.', 'err');
    if (!editing.id && (editing.stock === '' || +editing.stock < 0 || !Number.isInteger(+editing.stock))) {
      return toast('Stock tem de ser um número inteiro ≥ 0.', 'err');
    }
    setSaving(true);
    await saveMutation.mutateAsync(editing);
    setSaving(false);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Produtos</h1>
          <p>{products.length} produtos doados pela Fidelidade · o stock atualiza automaticamente com as encomendas.</p>
        </div>
        <div className="actions">
          <button
            className="btn btn-line"
            onClick={() =>
              downloadCsv('produtos.csv', [
                ['Produto', 'Categoria', 'Estado', 'Preço', 'Stock', 'Stock inicial', 'Visível'],
                ...products.map((p) => [p.nome, categoryNome(p.category_id), p.estado, p.preco, p.stock, p.stock_inicial, p.ativo ? 'Sim' : 'Não']),
              ])
            }
          >
            <Icon name="down" />
            Exportar CSV
          </button>
          <button className="btn btn-red" onClick={() => openEdit()}>
            <Icon name="plus" />
            Novo produto
          </button>
        </div>
      </div>

      <div className="toolbar">
        <label className="field-inline" style={{ flex: 1, minWidth: 220, maxWidth: 360 }}>
          <Icon name="eye" />
          <input placeholder="Pesquisar produto…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="field-inline">
          <Icon name="tag" />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Categoria</th>
              <th>Estado</th>
              <th>Preço</th>
              <th>Stock</th>
              <th>Visível na loja</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">A carregar…</div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">Nenhum produto encontrado.</div>
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const low = p.stock > 0 && p.stock <= 3;
                const limite = categoryLimite(p.category_id);
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="prod">
                        {p.fotos.length ? (
                          <div
                            className="thumb photo zoom"
                            style={{ width: 56, height: 56, flex: '0 0 56px' }}
                            title="Ver fotografias"
                            onClick={() => setLightboxFor({ fotos: p.fotos, index: 0, nome: p.nome })}
                          >
                            <img src={p.fotos[0]} alt={p.nome} />
                            {p.fotos.length > 1 && <span className="n">{p.fotos.length}</span>}
                          </div>
                        ) : (
                          <div className="thumb nophoto" style={{ width: 56, height: 56, flex: '0 0 56px' }} title="Sem fotografia">
                            <ProductIcon name={p.icone} style={{ width: 26, height: 26 }} />
                          </div>
                        )}
                        <div>
                          <b>{p.nome}</b>
                          <small>{p.codigo_passaporte}</small>
                          {!p.fotos.length && (
                            <>
                              <br />
                              <span className="no-photo-tag">
                                <Icon name="alert" style={{ width: 12, height: 12 }} />
                                Sem fotografia
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      {categoryNome(p.category_id)}
                      {limite ? (
                        <>
                          {' '}
                          <span className="pill red" title="Limite por encomenda">
                            máx. {limite}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <span className="pill">{p.estado}</span>
                      {p.destaque_novo && (
                        <>
                          {' '}
                          <span className="pill" style={{ background: 'var(--red)', color: '#fff' }}>
                            Novo
                          </span>
                        </>
                      )}
                    </td>
                    <td className="num">{eur(p.preco)}</td>
                    <td>
                      <div className={`stock-cell ${low ? 'low' : ''}`}>
                        <div className="stepper">
                          <button disabled={p.stock <= 0} onClick={() => stockMutation.mutate({ id: p.id, delta: -1 })} aria-label="Menos">
                            −
                          </button>
                          <span>{p.stock}</span>
                          <button onClick={() => stockMutation.mutate({ id: p.id, delta: 1 })} aria-label="Mais">
                            +
                          </button>
                        </div>
                        <div>
                          <div className="lbl">{stockLabel(p.stock, low)}</div>
                          <div className="sbar">
                            <i style={{ width: `${Math.min(100, (p.stock / Math.max(p.stock_inicial, 1)) * 100)}%` }}></i>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <button
                        className={`toggle ${p.ativo ? 'on' : ''}`}
                        aria-label="Visível na loja"
                        onClick={() => toggleMutation.mutate({ id: p.id, ativo: !p.ativo })}
                      ></button>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button title="Editar" onClick={() => openEdit(p)}>
                          <Icon name="edit" />
                        </button>
                        <button className="del" title="Apagar" onClick={() => setDeleting(p)}>
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

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar produto' : 'Novo produto'}
        sub={editing?.id ? undefined : 'Doação Fidelidade · aparece na montra da loja'}
        icon="box"
        size="lg"
        left={
          editing?.id ? (
            <button
              className="btn btn-danger"
              onClick={() => {
                const p = products.find((x) => x.id === editing.id);
                if (p) {
                  setEditing(null);
                  setDeleting(p);
                }
              }}
            >
              <Icon name="trash" />
              Apagar
            </button>
          ) : undefined
        }
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button className="btn btn-red" disabled={saving} onClick={handleSave}>
              {saving ? 'A guardar…' : editing?.id ? 'Guardar alterações' : 'Criar produto'}
            </button>
          </>
        }
      >
        {editing && (
          <div className="form">
            <div className="cols">
              <div className="f">
                <label>Nome do produto</label>
                <input value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} placeholder="Ex.: Cadeira de escritório" />
              </div>
              <div className="f">
                <label>Categoria</label>
                <select value={editing.category_id} onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                      {c.limite_unidades ? ` (máx. ${c.limite_unidades}/encomenda)` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="cols3">
              <div className="f">
                <label>Preço solidário</label>
                <div className="input-suffix">
                  <input type="number" min={0} step="0.5" value={editing.preco} onChange={(e) => setEditing({ ...editing, preco: e.target.value })} />
                  <span>€</span>
                </div>
              </div>
              <div className="f">
                <label>Estado</label>
                <select value={editing.estado} onChange={(e) => setEditing({ ...editing, estado: e.target.value as FormState['estado'] })}>
                  {ESTADOS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label>
                  Peso <small>(para o impacto)</small>
                </label>
                <div className="input-suffix">
                  <input type="number" min={0} step="0.1" value={editing.peso_kg} onChange={(e) => setEditing({ ...editing, peso_kg: e.target.value })} />
                  <span>kg</span>
                </div>
              </div>
            </div>
            <div className="cols">
              {!editing.id ? (
                <div className="f">
                  <label>Stock disponível</label>
                  <input type="number" min={0} step={1} value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: e.target.value })} />
                  <div className="hint">Desce sozinho a cada encomenda e volta ao cancelar/expirar.</div>
                </div>
              ) : (
                <div className="f">
                  <span className="l">Código</span>
                  <input value={products.find((p) => p.id === editing.id)?.codigo_passaporte ?? ''} disabled style={{ background: 'var(--paper-2)' }} />
                </div>
              )}
              <div className="f">
                <span className="l">Ícone</span>
                <div className="icon-pick">
                  {ICON_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={editing.icone === k ? 'on' : ''}
                      onClick={() => setEditing({ ...editing, icone: k })}
                      title={k}
                    >
                      <ProductIcon name={k} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="f">
              <span className="l">
                Fotografias <small>· até {MAXF} · JPG, PNG ou WebP até 5 MB · a primeira é a capa na loja</small>
              </span>
              <div className="gallery">
                {editing.fotos.map((f, k) => (
                  <div className={`ph-card ${k === 0 ? 'cover' : ''}`} key={f}>
                    {k === 0 && <span className="cv">Capa</span>}
                    <img src={f} alt={`Fotografia ${k + 1}`} onClick={() => setLightboxFor({ fotos: editing.fotos, index: k, nome: editing.nome })} />
                    <div className="tools">
                      <button type="button" disabled={k === 0} onClick={() => moveFoto(k, -1)} title="Mover para a esquerda">
                        <Icon name="chev" style={{ width: 15, height: 15 }} />
                      </button>
                      {k > 0 && (
                        <button type="button" onClick={() => makeCover(k)} title="Tornar capa">
                          ★
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={k === editing.fotos.length - 1}
                        onClick={() => moveFoto(k, 1)}
                        title="Mover para a direita"
                        style={{ transform: 'scaleX(-1)' }}
                      >
                        <Icon name="chev" style={{ width: 15, height: 15 }} />
                      </button>
                      <button type="button" className="del" onClick={() => removeFoto(k)} title="Remover">
                        <Icon name="trash" style={{ width: 15, height: 15 }} />
                      </button>
                    </div>
                  </div>
                ))}
                {editing.fotos.length < MAXF && (
                  <label
                    className={`drop${dragOver ? ' over' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      addFiles(e.dataTransfer.files);
                    }}
                  >
                    <Icon name="plus" style={{ width: 26, height: 26 }} />
                    <span>
                      <b>{uploading ? 'A enviar…' : 'Adicionar fotos'}</b>
                      arrasta para aqui ou clica
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      hidden
                      disabled={uploading}
                      onChange={(e) => e.target.files && addFiles(e.target.files)}
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="f">
              <label>
                Descrição <small>(opcional)</small>
              </label>
              <textarea
                rows={3}
                placeholder="Detalhes, medidas, marcas de uso…"
                value={editing.descricao}
                onChange={(e) => setEditing({ ...editing, descricao: e.target.value })}
              />
            </div>
            <div className="cols">
              <div className="switch-row">
                <div>
                  <b>Visível na loja</b>
                  <span>Os colaboradores podem ver e comprar</span>
                </div>
                <button
                  type="button"
                  className={`toggle ${editing.ativo ? 'on' : ''}`}
                  onClick={() => setEditing({ ...editing, ativo: !editing.ativo })}
                ></button>
              </div>
              <div className="switch-row">
                <div>
                  <b>Selo "Chegou hoje"</b>
                  <span>Destaque na montra</span>
                </div>
                <button
                  type="button"
                  className={`toggle ${editing.destaque_novo ? 'on' : ''}`}
                  onClick={() => setEditing({ ...editing, destaque_novo: !editing.destaque_novo })}
                ></button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Apagar produto?"
        danger
        ok="Apagar"
        msg={
          <>
            Vais apagar <b>{deleting?.nome}</b>. Esta ação não pode ser anulada. As encomendas antigas mantêm o histórico.
          </>
        }
        onYes={() => deleting && deleteMutation.mutate(deleting.id)}
      />

      {lightboxFor && <Lightbox {...lightboxFor} onClose={() => setLightboxFor(null)} />}
    </>
  );
}

function Lightbox({ fotos, index, nome, onClose }: { fotos: string[]; index: number; nome: string; onClose: () => void }) {
  const [k, setK] = useState(index);
  const [on, setOn] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setOn(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setK((v) => (v + 1) % fotos.length);
      if (e.key === 'ArrowLeft') setK((v) => (v - 1 + fotos.length) % fotos.length);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={`lb${on ? ' on' : ''}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lb-top">
        <div>
          <b>{nome}</b>
          <span>
            {k + 1} / {fotos.length}
          </span>
        </div>
        <button onClick={onClose} aria-label="Fechar">
          <Icon name="x" />
        </button>
      </div>
      <div className="lb-main">
        {fotos.length > 1 && (
          <button className="lb-nav p" onClick={() => setK((v) => (v - 1 + fotos.length) % fotos.length)} aria-label="Anterior">
            <Icon name="chev" />
          </button>
        )}
        <img src={fotos[k]} alt="" />
        {fotos.length > 1 && (
          <button className="lb-nav n" style={{ transform: 'translateY(-50%) scaleX(-1)' }} onClick={() => setK((v) => (v + 1) % fotos.length)} aria-label="Seguinte">
            <Icon name="chev" />
          </button>
        )}
      </div>
      <div className="lb-strip">
        {fotos.length > 1 &&
          fotos.map((f, i) => <img key={f} src={f} className={i === k ? 'on' : ''} onClick={() => setK(i)} alt="" />)}
      </div>
    </div>
  );
}
