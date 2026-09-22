import { useMemo, useRef, useState, type DragEvent as ReactDragEvent, type ChangeEvent as ReactChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon } from '../lib/icons';
import { useToast } from '../context/ToastContext';
import { downloadCsv } from '../lib/csv';
import { slugify } from '../lib/text';
import { getOrCreateCategory } from '../lib/categories';
import { readDroppedItems, readFileList, type DroppedFolder } from '../lib/folderDrop';
import { parseProdutosCsv, parseProdutosJson, estadoFromGrade, reviewStatusFor, type ImportRow } from '../lib/importParse';
import { runImagePipeline, type ProcessOutcome } from '../lib/imageQueue';
import { uploadProcessedImage, deleteProductImageFiles, safeSourceName } from '../lib/storageUpload';
import { pLimit } from '../lib/concurrency';
import { processImage } from '../lib/imagePipeline';
import type { Category, Product, ProductImage, QualityFlags } from '../types';

type ProductPreview = {
  row: ImportRow;
  isNew: boolean;
  fotosFound: string[];
  fotosMissing: string[];
  reviewStatus: string | null;
};

type Preview = {
  categoriasNovas: string[];
  categoriasExistentes: string[];
  produtos: ProductPreview[];
  fotosExtra: string[];
  totais: { novos: number; atualizados: number; publicados: number; naoPublicados: number; fotosEncontradas: number; fotosEmFalta: number };
};

type ImportReport = {
  categoriasCriadas: number;
  produtosCriados: number;
  produtosAtualizados: number;
  produtosSaltados: number;
  fotosEnviadas: number;
  fotosComAvisos: number;
  avisos: string[];
  erros: string[];
};

const QUALITY_LABELS: Record<keyof QualityFlags, string> = {
  baixa_resolucao: 'baixa resolução',
  muito_escura: 'muito escura',
  muito_clara: 'muito clara',
  desfocada: 'desfocada',
  objeto_a_tocar_na_borda: 'objeto toca na borda',
  duplicada: 'duplicada',
  needs_reprocessing: 'por reprocessar',
};

function qualityWarnings(flags: QualityFlags | null | undefined): string[] {
  if (!flags) return [];
  return (Object.keys(QUALITY_LABELS) as (keyof QualityFlags)[]).filter((k) => flags[k]).map((k) => QUALITY_LABELS[k]);
}

function buildPreview(rows: ImportRow[], folder: DroppedFolder, categories: Category[], products: Product[]): Preview {
  const existingSlugs = new Set(categories.map((c) => c.slug));
  const seenSlugs = new Set<string>();
  const categoriasNovas: string[] = [];
  const categoriasExistentes: string[] = [];
  const existingByExternalId = new Map(products.filter((p) => p.external_id).map((p) => [p.external_id as string, p]));
  const referencedFotos = new Set<string>();

  const produtos: ProductPreview[] = rows.map((row) => {
    const slug = slugify(row.categoria || 'sem-categoria');
    if (!seenSlugs.has(slug)) {
      seenSlugs.add(slug);
      (existingSlugs.has(slug) ? categoriasExistentes : categoriasNovas).push(row.categoria || 'Sem categoria');
    }
    const fotosFound = row.fotos.filter((f) => folder.images.has(f));
    const fotosMissing = row.fotos.filter((f) => !folder.images.has(f));
    fotosFound.forEach((f) => referencedFotos.add(f));
    return {
      row,
      isNew: !existingByExternalId.has(row.external_id),
      fotosFound,
      fotosMissing,
      reviewStatus: reviewStatusFor(row, fotosFound.length),
    };
  });

  const fotosExtra = [...folder.images.keys()].filter((f) => !referencedFotos.has(f));

  return {
    categoriasNovas,
    categoriasExistentes,
    produtos,
    fotosExtra,
    totais: {
      novos: produtos.filter((p) => p.isNew).length,
      atualizados: produtos.filter((p) => !p.isNew).length,
      publicados: produtos.filter((p) => p.reviewStatus === null).length,
      naoPublicados: produtos.filter((p) => p.reviewStatus !== null).length,
      fotosEncontradas: produtos.reduce((s, p) => s + p.fotosFound.length, 0),
      fotosEmFalta: produtos.reduce((s, p) => s + p.fotosMissing.length, 0),
    },
  };
}

export function Importar() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [dragOver, setDragOver] = useState(false);
  const [folder, setFolder] = useState<DroppedFolder | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [phase, setPhase] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<ImportReport | null>(null);
  const [reprocessing, setReprocessing] = useState<{ done: number; total: number } | null>(null);

  const [testFiles, setTestFiles] = useState<File[]>([]);
  const [testResults, setTestResults] = useState<{ name: string; result: Awaited<ReturnType<typeof processImage>> }[]>([]);
  const [testing, setTesting] = useState(false);
  const testInputRef = useRef<HTMLInputElement>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('ordem');
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('nome');
      if (error) throw error;
      return data as Product[];
    },
  });

  const preview = useMemo(() => (folder && rows.length ? buildPreview(rows, folder, categories, products) : null), [folder, rows, categories, products]);

  async function loadFolder(next: DroppedFolder) {
    if (!next.dataFile) {
      toast('Não encontrei produtos_site.json nem produtos_site.csv nesta pasta', 'err');
      return;
    }
    try {
      const text = await next.dataFile.text();
      const parsed = next.dataFileType === 'json' ? parseProdutosJson(text) : parseProdutosCsv(text);
      if (parsed.length === 0) {
        toast('O ficheiro de produtos não tem linhas válidas', 'err');
        return;
      }
      setFolder(next);
      setRows(parsed);
      setReport(null);
      setPhase('preview');
    } catch (e) {
      toast(`Erro a ler ${next.dataFile.name}: ${e instanceof Error ? e.message : String(e)}`, 'err');
    }
  }

  async function handleDrop(e: ReactDragEvent) {
    e.preventDefault();
    setDragOver(false);
    const next = await readDroppedItems(e.dataTransfer.items);
    await loadFolder(next);
  }

  function handleFolderInput(e: ReactChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    void loadFolder(readFileList(e.target.files));
    e.target.value = '';
  }

  async function runImport() {
    if (!preview || !folder) return;
    setPhase('importing');
    const report: ImportReport = {
      categoriasCriadas: 0,
      produtosCriados: 0,
      produtosAtualizados: 0,
      produtosSaltados: 0,
      fotosEnviadas: 0,
      fotosComAvisos: 0,
      avisos: [],
      erros: [],
    };
    const categoryCache = new Map<string, Category>();
    const categoriasAntes = new Set(categories.map((c) => c.slug));
    const existingByExternalId = new Map(products.filter((p) => p.external_id).map((p) => [p.external_id as string, p]));

    type PhotoTask = { id: string; file: File; productId: string; sourceFilename: string; posicao: number; capa: boolean };
    const photoTasks: PhotoTask[] = [];
    const totalFotosPrevistas = preview.produtos.reduce((s, p) => s + p.fotosFound.length, 0);
    setProgress({ done: 0, total: totalFotosPrevistas });

    for (const p of preview.produtos) {
      try {
        const categoria = await getOrCreateCategory(supabase, p.row.categoria, categoryCache, { createdByImport: true });
        if (!categoriasAntes.has(categoria.slug)) {
          categoriasAntes.add(categoria.slug);
          report.categoriasCriadas++;
        }

        const ativo = p.reviewStatus === null;
        const existing = existingByExternalId.get(p.row.external_id);
        const payload = {
          nome: p.row.nome,
          category_id: categoria.id,
          preco: p.row.preco,
          estado: estadoFromGrade(p.row.grade),
          medidas: p.row.medidas,
          formato: p.row.formato,
          edificios: p.row.edificios,
          grade: p.row.grade,
          destinos: p.row.destinos,
          codigo_slide: p.row.codigo_slide,
          review_status: p.reviewStatus,
          ativo,
        };

        let productId: string;
        if (existing) {
          const { error } = await supabase.from('products').update(payload).eq('id', existing.id);
          if (error) throw error;
          productId = existing.id;
          report.produtosAtualizados++;
        } else {
          const stock = p.row.stock;
          const { data, error } = await supabase
            .from('products')
            .insert({
              ...payload,
              slug: slugify(p.row.nome) + '-' + Math.random().toString(36).slice(2, 6),
              icone: 'box',
              peso_kg: 0,
              stock,
              stock_inicial: stock,
              codigo_passaporte: `BBD-${p.row.external_id}`,
              external_id: p.row.external_id,
            })
            .select('id')
            .single();
          if (error) throw error;
          productId = (data as { id: string }).id;
          report.produtosCriados++;
        }

        // Retoma: se as fotos já foram todas enviadas numa importação anterior, salta.
        const { data: existingImages } = await supabase.from('product_images').select('id, original_path').eq('product_id', productId);
        const existingNames = new Set(
          (existingImages ?? []).map((i) => {
            const m = /\/([^/]+)-original\.[a-z0-9]+$/i.exec(i.original_path);
            return m ? m[1] : '';
          }),
        );
        const expectedNames = new Set(p.fotosFound.map(safeSourceName));
        const alreadyDone = p.fotosFound.length > 0 && expectedNames.size === existingNames.size && [...expectedNames].every((n) => existingNames.has(n));

        if (alreadyDone) {
          report.produtosSaltados++;
          continue;
        }

        if ((existingImages?.length ?? 0) > 0) {
          const oldPaths = (existingImages ?? []).flatMap((i) => [i.original_path]);
          const { data: fullRows } = await supabase.from('product_images').select('*').eq('product_id', productId);
          await deleteProductImageFiles(
            supabase,
            (fullRows ?? []).flatMap((r) => [r.original_path, r.large_path, r.medium_path, r.thumb_path]),
          );
          void oldPaths;
          await supabase.from('product_images').delete().eq('product_id', productId);
        }

        p.fotosFound.forEach((filename, posicao) => {
          const file = folder.images.get(filename);
          if (file) photoTasks.push({ id: `${productId}:${filename}`, file, productId, sourceFilename: filename, posicao, capa: posicao === 0 });
        });
      } catch (e) {
        report.erros.push(`${p.row.external_id} (${p.row.nome}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Processa (pool de workers) e envia (concorrência de rede limitada) as fotos de todos
    // os produtos em conjunto, para a barra de progresso refletir o total real de fotos.
    setProgress({ done: 0, total: photoTasks.length });
    const uploadLimit = pLimit(5);
    let done = 0;
    const uploads: Promise<void>[] = [];

    await runImagePipeline(
      photoTasks.map((t) => ({ id: t.id, file: t.file })),
      {
        concurrency: 4,
        onItem: (outcome: ProcessOutcome) => {
          const task = photoTasks.find((t) => t.id === outcome.id);
          if (!task) return;
          if (!outcome.result) {
            report.erros.push(`${task.sourceFilename}: ${outcome.error ?? 'falha desconhecida'}`);
            done++;
            setProgress({ done, total: photoTasks.length });
            return;
          }
          const result = outcome.result;
          uploads.push(
            uploadLimit(async () => {
              try {
                const paths = await uploadProcessedImage(supabase, task.productId, task.sourceFilename, result);
                await supabase.from('product_images').insert({
                  product_id: task.productId,
                  posicao: task.posicao,
                  capa: task.capa,
                  ...paths,
                  quality_flags: result.quality_flags,
                  enquadramento: result.enquadramento,
                });
                report.fotosEnviadas++;
                if (qualityWarnings(result.quality_flags).length) report.fotosComAvisos++;
              } catch (e) {
                report.erros.push(`${task.sourceFilename}: ${e instanceof Error ? e.message : String(e)}`);
              } finally {
                done++;
                setProgress({ done, total: photoTasks.length });
              }
            }),
          );
        },
      },
    );
    await Promise.all(uploads);

    await supabase.from('import_logs').insert({ summary: report });
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    setReport(report);
    setPhase('done');
    toast('Importação concluída', 'ok', `${report.produtosCriados} novos · ${report.produtosAtualizados} atualizados · ${report.fotosEnviadas} fotos`);
  }

  async function reprocessAll() {
    const { data: images, error } = await supabase.from('product_images').select('*').returns<ProductImage[]>();
    if (error || !images) {
      toast('Não foi possível carregar as fotos existentes', 'err');
      return;
    }
    setReprocessing({ done: 0, total: images.length });
    let done = 0;

    const fetched = await Promise.all(
      images.map(async (img) => {
        try {
          const res = await fetch(img.original_path);
          const blob = await res.blob();
          return { img, file: blob };
        } catch {
          return { img, file: null };
        }
      }),
    );
    const valid = fetched.filter((f): f is { img: ProductImage; file: Blob } => f.file !== null);
    const uploadLimit = pLimit(5);
    const uploads: Promise<void>[] = [];

    await runImagePipeline(
      valid.map((v) => ({ id: v.img.id, file: v.file })),
      {
        concurrency: 4,
        onItem: (outcome) => {
          const entry = valid.find((v) => v.img.id === outcome.id);
          if (!entry || !outcome.result) {
            done++;
            setReprocessing({ done, total: images.length });
            return;
          }
          const result = outcome.result;
          uploads.push(
            uploadLimit(async () => {
              try {
                const paths = await uploadProcessedImage(supabase, entry.img.product_id, entry.img.id, result);
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
                  .eq('id', entry.img.id);
              } catch {
                /* mantém a foto anterior se o reprocessamento falhar */
              } finally {
                done++;
                setReprocessing({ done, total: images.length });
              }
            }),
          );
        },
      },
    );
    await Promise.all(uploads);

    setReprocessing(null);
    queryClient.invalidateQueries({ queryKey: ['products'] });
    toast('Reprocessamento de imagens concluído');
  }

  async function runTest() {
    if (testFiles.length === 0) return;
    setTesting(true);
    setTestResults([]);
    const out: { name: string; result: Awaited<ReturnType<typeof processImage>> }[] = [];
    for (const file of testFiles.slice(0, 10)) {
      try {
        out.push({ name: file.name, result: await processImage(file) });
      } catch {
        /* ignora ficheiro que falhe no teste */
      }
    }
    setTestResults(out);
    setTesting(false);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Importar produtos</h1>
          <p>Arrasta a pasta FOTOS_SITE (produtos_site.json/.csv + imagens/) para criar categorias, produtos e fotos automaticamente.</p>
        </div>
        <div className="actions">
          <button className="btn btn-line" onClick={reprocessAll} disabled={!!reprocessing}>
            <Icon name="refresh" />
            {reprocessing ? `A reprocessar… ${reprocessing.done}/${reprocessing.total}` : 'Reprocessar todas as imagens'}
          </button>
        </div>
      </div>

      {phase !== 'importing' && (
        <label
          className={`drop${dragOver ? ' over' : ''}`}
          style={{ aspectRatio: 'auto', height: 160, marginBottom: 24 }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Icon name="upload" style={{ width: 30, height: 30 }} />
          <span>
            <b>{folder ? folder.dataFile?.name : 'Arrasta a pasta FOTOS_SITE para aqui'}</b>
            {folder ? `${folder.images.size} fotos encontradas na pasta` : 'ou clica para escolher a pasta'}
          </span>
          <input
            type="file"
            // @ts-expect-error -- webkitdirectory não está nos tipos do lib.dom, mas é suportado nos browsers alvo
            webkitdirectory=""
            multiple
            hidden
            onChange={handleFolderInput}
          />
        </label>
      )}

      {preview && phase === 'preview' && (
        <>
          <div className="cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
            <PreviewStat label="Categorias novas" value={preview.categoriasNovas.length} />
            <PreviewStat label="Categorias existentes" value={preview.categoriasExistentes.length} />
            <PreviewStat label="Produtos novos" value={preview.totais.novos} />
            <PreviewStat label="Produtos a atualizar" value={preview.totais.atualizados} />
            <PreviewStat label="Vão ficar publicados" value={preview.totais.publicados} />
            <PreviewStat label="Não publicados" value={preview.totais.naoPublicados} />
            <PreviewStat label="Fotos encontradas" value={preview.totais.fotosEncontradas} />
            <PreviewStat label="Fotos em falta" value={preview.totais.fotosEmFalta} warn={preview.totais.fotosEmFalta > 0} />
          </div>

          {preview.categoriasNovas.length > 0 && (
            <p className="hint">
              Categorias novas a criar: <b>{preview.categoriasNovas.join(', ')}</b>
            </p>
          )}
          {preview.fotosExtra.length > 0 && (
            <p className="hint">
              {preview.fotosExtra.length} fotos na pasta não estão referenciadas em nenhum produto (ignoradas).
            </p>
          )}

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Fotos</th>
                  <th>Publicação</th>
                </tr>
              </thead>
              <tbody>
                {preview.produtos.map((p) => (
                  <tr key={p.row.external_id}>
                    <td>
                      <b>{p.row.nome}</b>
                      <br />
                      <small>{p.row.external_id}</small> <span className="pill">{p.isNew ? 'novo' : 'atualiza'}</span>
                    </td>
                    <td>{p.row.categoria || 'Sem categoria'}</td>
                    <td>
                      {p.fotosFound.length}/{p.row.fotos.length}
                      {p.fotosMissing.length > 0 && (
                        <>
                          {' '}
                          <span className="pill" style={{ background: 'var(--red)', color: '#fff' }}>
                            {p.fotosMissing.length} em falta
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {p.reviewStatus === null ? (
                        <span className="pill" style={{ background: 'var(--navy)', color: '#fff' }}>
                          Publicado
                        </span>
                      ) : (
                        <span title={p.reviewStatus} className="pill">
                          Por rever
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="actions" style={{ marginTop: 16 }}>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setFolder(null);
                setRows([]);
                setPhase('idle');
              }}
            >
              Cancelar
            </button>
            <button className="btn btn-red" onClick={runImport}>
              <Icon name="upload" />
              Importar tudo
            </button>
          </div>
        </>
      )}

      {phase === 'importing' && (
        <div className="stock-cell" style={{ marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <div className="lbl">
              A importar… {progress.done}/{progress.total} fotos
            </div>
            <div className="sbar" style={{ width: '100%' }}>
              <i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}></i>
            </div>
          </div>
        </div>
      )}

      {report && phase === 'done' && (
        <div className="table-wrap" style={{ padding: 16 }}>
          <h3>Relatório da importação</h3>
          <ul>
            <li>{report.categoriasCriadas} categorias criadas</li>
            <li>{report.produtosCriados} produtos criados</li>
            <li>{report.produtosAtualizados} produtos atualizados</li>
            <li>{report.produtosSaltados} produtos saltados (fotos já importadas antes)</li>
            <li>{report.fotosEnviadas} fotos enviadas</li>
            <li>{report.fotosComAvisos} fotos com avisos de qualidade</li>
            <li>{report.erros.length} erros</li>
          </ul>
          {report.erros.length > 0 && (
            <details>
              <summary>Ver erros</summary>
              <ul>
                {report.erros.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="actions">
            <button
              className="btn btn-line"
              onClick={() =>
                downloadCsv('importacao.csv', [
                  ['Categorias criadas', 'Produtos criados', 'Produtos atualizados', 'Fotos enviadas', 'Fotos com avisos', 'Erros'],
                  [report.categoriasCriadas, report.produtosCriados, report.produtosAtualizados, report.fotosEnviadas, report.fotosComAvisos, report.erros.length],
                ])
              }
            >
              <Icon name="down" />
              Descarregar relatório
            </button>
            <button
              className="btn btn-red"
              onClick={() => {
                setFolder(null);
                setRows([]);
                setReport(null);
                setPhase('idle');
              }}
            >
              Nova importação
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ padding: 16, marginTop: 32 }}>
        <h3>Testar tratamento de imagens</h3>
        <p className="hint">Escolhe até 10 fotos para ver o resultado do tratamento automático sem gravar nada.</p>
        <div className="actions">
          <button className="btn btn-line" onClick={() => testInputRef.current?.click()}>
            Escolher fotos
          </button>
          <input
            ref={testInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => setTestFiles(e.target.files ? Array.from(e.target.files).slice(0, 10) : [])}
          />
          <button className="btn btn-red" disabled={testFiles.length === 0 || testing} onClick={runTest}>
            {testing ? 'A processar…' : `Testar ${testFiles.length ? `(${testFiles.length})` : ''}`}
          </button>
        </div>
        {testResults.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Ficheiro</th>
                  <th>Original</th>
                  <th>Medium (800×800)</th>
                  <th>Thumb (300×300)</th>
                  <th>Avisos</th>
                </tr>
              </thead>
              <tbody>
                {testResults.map((t) => {
                  const warnings = qualityWarnings(t.result.quality_flags);
                  return (
                    <tr key={t.name}>
                      <td>{t.name}</td>
                      <td>
                        <img src={URL.createObjectURL(t.result.original)} alt="" style={{ width: 70, height: 70, objectFit: 'contain' }} />
                      </td>
                      <td>
                        <img src={URL.createObjectURL(t.result.medium.blob)} alt="" style={{ width: 70, height: 70, objectFit: 'contain' }} />
                      </td>
                      <td>
                        <img src={URL.createObjectURL(t.result.thumb.blob)} alt="" style={{ width: 70, height: 70, objectFit: 'contain' }} />
                      </td>
                      <td>
                        {warnings.length === 0 ? (
                          <span className="pill">ok</span>
                        ) : (
                          warnings.map((w) => (
                            <span key={w} className="pill" style={{ background: 'var(--red)', color: '#fff', marginRight: 4 }}>
                              {w}
                            </span>
                          ))
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function PreviewStat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="hint">{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: warn && value > 0 ? 'var(--red)' : 'var(--navy)' }}>{value}</div>
    </div>
  );
}
