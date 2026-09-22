import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon, ProductIcon, ICON_KEYS } from '../lib/icons';
import { Modal, ConfirmDialog } from '../components/Modal';
import { useToast } from '../context/ToastContext';
import { eur } from '../lib/orders';
import { downloadCsv } from '../lib/csv';
import { slugify } from '../lib/text';
import { getOrCreateCategory } from '../lib/categories';
import { processOneInWorker, regenerateInWorker, terminateImageWorker } from '../lib/imageQueue';
import { uploadProcessedImage, uploadRegeneratedSquares, deleteProductImageFiles } from '../lib/storageUpload';
import { Pagination, paginate } from '../components/Pagination';
import { ImportModal } from '../components/ImportModal';
import type { Category, Product, ProductImage, Enquadramento, QualityFlags } from '../types';

const ESTADOS = ['Novo', 'Como novo', 'Bom'] as const;
const MAXF = 12;
const NOVA_CATEGORIA = '__nova__';
const PAGE_SIZE = 10;

function hasQualityWarning(flags: QualityFlags | null | undefined) {
  if (!flags) return false;
  return Object.entries(flags).some(([k, v]) => v && k !== 'needs_reprocessing');
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
};

type FotoFiltro = 'revisao' | 'inativos' | 'sem_fotos' | 'sem_preco' | 'avisos';

export function Produtos() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [fotoFiltro, setFotoFiltro] = useState<FotoFiltro | ''>('');
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [reprocessing, setReprocessing] = useState<{ done: number; total: number } | null>(null);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxFor, setLightboxFor] = useState<{ fotos: string[]; index: number; nome: string } | null>(null);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState('');
  const [showNovaCategoria, setShowNovaCategoria] = useState(false);
  const [cropFor, setCropFor] = useState<ProductImage | null>(null);

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
      const { data, error } = await supabase.from('products').select('*, imagens:product_images(*)').order('nome');
      if (error) throw error;
      for (const p of data as Product[]) p.imagens?.sort((a, b) => a.posicao - b.posicao);
      return data as Product[];
    },
  });

  const categoryNome = (id: string | null) => categories.find((c) => c.id === id)?.nome ?? '—';
  const categoryLimite = (id: string | null) => categories.find((c) => c.id === id)?.limite_unidades ?? null;
  const imagensOf = (id?: string) => products.find((p) => p.id === id)?.imagens ?? [];

  function openEdit(p?: Product) {
    if (p) {
      setEditing({
        id: p.id,
        nome: p.nome,
        category_id: p.category_id ?? '',
        descricao: p.descricao ?? '',
        preco: p.preco === null ? '' : String(p.preco),
        estado: p.estado,
        icone: p.icone,
        peso_kg: String(p.peso_kg),
        stock: String(p.stock),
        destaque_novo: p.destaque_novo,
        ativo: p.ativo,
      });
    } else {
      setEditing({ ...EMPTY_FORM, category_id: categories[0]?.id ?? '' });
    }
    setNovaCategoriaNome('');
    setShowNovaCategoria(false);
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
    () =>
      products.filter((p) => {
        if (search && !p.nome.toLowerCase().includes(search.toLowerCase())) return false;
        if (categoryFilter && p.category_id !== categoryFilter) return false;
        if (fotoFiltro === 'revisao' && !p.review_status) return false;
        if (fotoFiltro === 'inativos' && p.ativo) return false;
        if (fotoFiltro === 'sem_fotos' && (p.imagens?.length ?? 0) > 0) return false;
        if (fotoFiltro === 'sem_preco' && p.preco !== null) return false;
        if (fotoFiltro === 'avisos' && !p.imagens?.some((i) => hasQualityWarning(i.quality_flags))) return false;
        return true;
      }),
    [products, search, categoryFilter, fotoFiltro],
  );

  useEffect(() => setPage(1), [search, categoryFilter, fotoFiltro]);
  const { pageItems: pagedProducts, totalPages, safePage } = paginate(filtered, page, PAGE_SIZE);

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
        preco: form.preco === '' ? null : Number(form.preco),
        estado: form.estado,
        icone: form.icone,
        peso_kg: Number(form.peso_kg) || 0,
        destaque_novo: form.destaque_novo,
        ativo: form.ativo,
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

  async function persistGalleryOrder(imagens: ProductImage[]) {
    await Promise.all(
      imagens.map((img, i) => supabase.from('product_images').update({ posicao: i, capa: i === 0 }).eq('id', img.id)),
    );
    queryClient.invalidateQueries({ queryKey: ['products'] });
  }

  async function addFiles(files: FileList | File[]) {
    if (!editing?.id) return;
    const productId = editing.id;
    const list = [...files];
    const current = imagensOf(productId);
    let skipped = 0;
    const accepted: File[] = [];
    for (const f of list) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
        toast(`${f.name}: formato não suportado`, 'err');
        continue;
      }
      if (f.size > 15 * 1024 * 1024) {
        toast(`${f.name}: maior que 15 MB`, 'err');
        continue;
      }
      if (current.length + accepted.length >= MAXF) {
        skipped++;
        continue;
      }
      accepted.push(f);
    }
    if (skipped) toast(`Máximo de ${MAXF} fotografias por produto`, 'err');
    if (accepted.length === 0) return;

    setUploading(true);
    let posicao = current.length;
    for (const file of accepted) {
      try {
        const result = await processOneInWorker(file);
        const paths = await uploadProcessedImage(supabase, productId, file.name, result);
        const thisPos = posicao++;
        await supabase.from('product_images').insert({
          product_id: productId,
          posicao: thisPos,
          capa: thisPos === 0,
          ...paths,
          quality_flags: result.quality_flags,
          enquadramento: result.enquadramento,
        });
      } catch {
        toast(`Erro ao enviar ${file.name}`, 'err');
      }
    }
    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ['products'] });
  }

  function moveFoto(k: number, d: number) {
    if (!editing?.id) return;
    const imagens = [...imagensOf(editing.id)];
    [imagens[k], imagens[k + d]] = [imagens[k + d], imagens[k]];
    void persistGalleryOrder(imagens);
  }
  function makeCover(k: number) {
    if (!editing?.id) return;
    const imagens = [...imagensOf(editing.id)];
    imagens.unshift(imagens.splice(k, 1)[0]);
    void persistGalleryOrder(imagens);
    toast('Nova capa definida');
  }
  async function removeFoto(img: ProductImage) {
    if (!editing?.id) return;
    await supabase.from('product_images').delete().eq('id', img.id);
    await deleteProductImageFiles(supabase, [img.original_path, img.large_path, img.medium_path, img.thumb_path]);
    const remaining = imagensOf(editing.id).filter((i) => i.id !== img.id);
    await persistGalleryOrder(remaining);
  }
  async function reprocessFoto(img: ProductImage) {
    if (!editing?.id) return;
    try {
      const blob = await (await fetch(img.original_path)).blob();
      const result = await processOneInWorker(blob);
      const paths = await uploadProcessedImage(supabase, editing.id, img.id, result);
      await supabase
        .from('product_images')
        .update({
          large_path: paths.large_path,
          medium_path: paths.medium_path,
          thumb_path: paths.thumb_path,
          largura: paths.largura,
          altura: paths.altura,
          quality_flags: result.quality_flags,
          enquadramento: result.enquadramento,
        })
        .eq('id', img.id);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast('Foto reprocessada');
    } catch {
      toast('Não foi possível reprocessar esta foto', 'err');
    }
  }

  async function reprocessAll() {
    const { data: images, error } = await supabase.from('product_images').select('*').returns<ProductImage[]>();
    if (error || !images) {
      toast('Não foi possível carregar as fotos existentes', 'err');
      return;
    }
    setReprocessing({ done: 0, total: images.length });
    let ok = 0;
    for (const img of images) {
      try {
        const blob = await (await fetch(img.original_path)).blob();
        const result = await processOneInWorker(blob);
        const paths = await uploadProcessedImage(supabase, img.product_id, img.id, result);
        await supabase
          .from('product_images')
          .update({
            large_path: paths.large_path,
            medium_path: paths.medium_path,
            thumb_path: paths.thumb_path,
            largura: paths.largura,
            altura: paths.altura,
            quality_flags: result.quality_flags,
            enquadramento: result.enquadramento,
          })
          .eq('id', img.id);
        ok++;
      } catch {
        /* mantém a foto anterior se o reprocessamento desta falhar, e continua para a seguinte */
      }
      setReprocessing((prev) => (prev ? { done: prev.done + 1, total: prev.total } : prev));
    }
    terminateImageWorker();
    setReprocessing(null);
    queryClient.invalidateQueries({ queryKey: ['products'] });
    toast('Reprocessamento concluído', 'ok', `${ok} de ${images.length} fotos`);
  }

  async function handleNovaCategoria() {
    if (!novaCategoriaNome.trim() || !editing) return;
    try {
      const cat = await getOrCreateCategory(supabase, novaCategoriaNome, new Map());
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setEditing({ ...editing, category_id: cat.id });
      setNovaCategoriaNome('');
      setShowNovaCategoria(false);
      toast('Categoria criada');
    } catch {
      toast('Não foi possível criar a categoria', 'err');
    }
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.nome.trim()) return toast('Indica o nome do produto.', 'err');
    if (editing.preco !== '' && +editing.preco < 0) return toast('Preço inválido.', 'err');
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
                ...products.map((p) => [p.nome, categoryNome(p.category_id), p.estado, p.preco ?? '', p.stock, p.stock_inicial, p.ativo ? 'Sim' : 'Não']),
              ])
            }
          >
            <Icon name="down" />
            Exportar CSV
          </button>
          <button className="btn btn-line" onClick={reprocessAll} disabled={!!reprocessing}>
            <Icon name="refresh" />
            {reprocessing ? `A reprocessar… ${reprocessing.done}/${reprocessing.total}` : 'Reprocessar todas as imagens'}
          </button>
          <button className="btn btn-line" onClick={() => setImportOpen(true)}>
            <Icon name="upload" />
            Importar
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
        <label className="field-inline">
          <Icon name="alert" />
          <select value={fotoFiltro} onChange={(e) => setFotoFiltro(e.target.value as FotoFiltro | '')}>
            <option value="">Todos os produtos</option>
            <option value="revisao">Por rever</option>
            <option value="inativos">Não publicados</option>
            <option value="sem_fotos">Sem fotos</option>
            <option value="sem_preco">Sem preço</option>
            <option value="avisos">Fotos com avisos</option>
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
              pagedProducts.map((p) => {
                const low = p.stock > 0 && p.stock <= 3;
                const limite = categoryLimite(p.category_id);
                const imagens = p.imagens ?? [];
                const fotosUrls = imagens.map((i) => i.large_path);
                const avisos = imagens.some((i) => hasQualityWarning(i.quality_flags));
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="prod">
                        {imagens.length ? (
                          <div
                            className="thumb photo zoom"
                            style={{ width: 56, height: 56, flex: '0 0 56px' }}
                            title="Ver fotografias"
                            onClick={() => setLightboxFor({ fotos: fotosUrls, index: 0, nome: p.nome })}
                          >
                            <img src={imagens[0].thumb_path} alt={p.nome} />
                            {imagens.length > 1 && <span className="n">{imagens.length}</span>}
                          </div>
                        ) : (
                          <div className="thumb nophoto" style={{ width: 56, height: 56, flex: '0 0 56px' }} title="Sem fotografia">
                            <ProductIcon name={p.icone} style={{ width: 26, height: 26 }} />
                          </div>
                        )}
                        <div>
                          <b>{p.nome}</b>
                          <small>{p.codigo_passaporte}</small>
                          {p.review_status && (
                            <>
                              <br />
                              <span className="no-photo-tag" title={p.review_status}>
                                <Icon name="alert" style={{ width: 12, height: 12 }} />
                                Por rever
                              </span>
                            </>
                          )}
                          {avisos && (
                            <>
                              <br />
                              <span className="no-photo-tag" title="Alguma foto tem avisos de qualidade">
                                <Icon name="alert" style={{ width: 12, height: 12 }} />
                                Fotos com avisos
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
                    <td className="num">{p.preco === null ? '—' : eur(p.preco)}</td>
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
      <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />

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
                <select
                  value={editing.category_id}
                  onChange={(e) => (e.target.value === NOVA_CATEGORIA ? setShowNovaCategoria(true) : setEditing({ ...editing, category_id: e.target.value }))}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                      {c.limite_unidades ? ` (máx. ${c.limite_unidades}/encomenda)` : ''}
                    </option>
                  ))}
                  <option value={NOVA_CATEGORIA}>+ Nova categoria…</option>
                </select>
                {showNovaCategoria && (
                  <div className="input-suffix" style={{ marginTop: 6 }}>
                    <input
                      autoFocus
                      placeholder="Nome da nova categoria"
                      value={novaCategoriaNome}
                      onChange={(e) => setNovaCategoriaNome(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleNovaCategoria()}
                    />
                    <button type="button" className="btn btn-line" onClick={handleNovaCategoria}>
                      Criar
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="cols3">
              <div className="f">
                <label>
                  Preço solidário <small>(vazio = por avaliar, não publica)</small>
                </label>
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
                Fotografias <small>· até {MAXF} · JPG, PNG ou WebP · a primeira é a capa na loja</small>
              </span>
              {!editing.id ? (
                <div className="hint">Grava o produto para poderes adicionar fotografias.</div>
              ) : (
                <div className="gallery">
                  {imagensOf(editing.id).map((img, k, arr) => {
                    const warnings = hasQualityWarning(img.quality_flags);
                    return (
                      <div className={`ph-card ${k === 0 ? 'cover' : ''}`} key={img.id}>
                        {k === 0 && <span className="cv">Capa</span>}
                        {warnings && (
                          <span className="cv" style={{ left: 'auto', right: 6, background: 'var(--red)' }} title="Tem avisos de qualidade">
                            <Icon name="alert" style={{ width: 12, height: 12 }} />
                          </span>
                        )}
                        <img
                          src={img.medium_path}
                          alt={`Fotografia ${k + 1}`}
                          onClick={() => setLightboxFor({ fotos: arr.map((i) => i.large_path), index: k, nome: editing.nome })}
                        />
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
                            disabled={k === arr.length - 1}
                            onClick={() => moveFoto(k, 1)}
                            title="Mover para a direita"
                            style={{ transform: 'scaleX(-1)' }}
                          >
                            <Icon name="chev" style={{ width: 15, height: 15 }} />
                          </button>
                          <button type="button" onClick={() => setCropFor(img)} title="Ajustar enquadramento">
                            <Icon name="tag" style={{ width: 15, height: 15 }} />
                          </button>
                          <button type="button" onClick={() => reprocessFoto(img)} title="Reprocessar">
                            <Icon name="refresh" style={{ width: 15, height: 15 }} />
                          </button>
                          <button type="button" className="del" onClick={() => removeFoto(img)} title="Remover">
                            <Icon name="trash" style={{ width: 15, height: 15 }} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {imagensOf(editing.id).length < MAXF && (
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
                        <b>{uploading ? 'A tratar e a enviar…' : 'Adicionar fotos'}</b>
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
              )}
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

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}

      {cropFor && editing?.id && (
        <EnquadramentoEditor
          img={cropFor}
          onClose={() => setCropFor(null)}
          onSave={async (box) => {
            try {
              const blob = await (await fetch(cropFor.original_path)).blob();
              const squares = await regenerateInWorker(blob, box);
              const paths = await uploadRegeneratedSquares(supabase, editing.id!, cropFor.id, squares);
              await supabase.from('product_images').update({ ...paths, enquadramento: box }).eq('id', cropFor.id);
              queryClient.invalidateQueries({ queryKey: ['products'] });
              toast('Enquadramento atualizado');
            } catch {
              toast('Não foi possível guardar o novo enquadramento', 'err');
            }
            setCropFor(null);
          }}
        />
      )}
    </>
  );
}

/** Editor simples de enquadramento: arrasta para mover, pega no canto para redimensionar. */
function EnquadramentoEditor({ img, onClose, onSave }: { img: ProductImage; onClose: () => void; onSave: (box: Enquadramento) => void }) {
  const [box, setBox] = useState<Enquadramento>(img.enquadramento ?? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const containerRef = useRef<HTMLDivElement>(null);

  function onDrag(mode: 'move' | 'resize') {
    return (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const start = { ...box };
      const onMove = (ev: PointerEvent) => {
        const dx = (ev.clientX - startX) / rect.width;
        const dy = (ev.clientY - startY) / rect.height;
        setBox((prev) => {
          if (mode === 'move') {
            const x = Math.min(Math.max(0, start.x + dx), 1 - start.w);
            const y = Math.min(Math.max(0, start.y + dy), 1 - start.h);
            return { ...prev, x, y };
          }
          const w = Math.min(Math.max(0.05, start.w + dx), 1 - start.x);
          const h = Math.min(Math.max(0.05, start.h + dy), 1 - start.y);
          return { ...prev, w, h };
        });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Ajustar enquadramento"
      sub="Arrasta a caixa ou o canto — vai definir o que aparece nos cartões e miniaturas"
      icon="tag"
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-red" onClick={() => onSave(box)}>
            Guardar enquadramento
          </button>
        </>
      }
    >
      <div ref={containerRef} style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: '#111', overflow: 'hidden' }}>
        <img src={img.large_path} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
        <div
          onPointerDown={onDrag('move')}
          style={{
            position: 'absolute',
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.w * 100}%`,
            height: `${box.h * 100}%`,
            border: '2px solid var(--red)',
            cursor: 'move',
            boxShadow: '0 0 0 2000px rgba(0,0,0,.35)',
          }}
        >
          <div
            onPointerDown={onDrag('resize')}
            style={{ position: 'absolute', right: -6, bottom: -6, width: 14, height: 14, background: 'var(--red)', borderRadius: '50%', cursor: 'nwse-resize' }}
          />
        </div>
      </div>
    </Modal>
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
