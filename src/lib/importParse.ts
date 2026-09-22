// Leitura do produtos_site.json / produtos_site.csv da pasta FOTOS_SITE do Banco de Bens
// Doados, e as regras de importação (publicação automática, mapeamento de grade->estado).
export type ImportRow = {
  external_id: string;
  codigo_slide: string | null;
  nome: string;
  categoria: string | null;
  medidas: string | null;
  formato: string | null;
  grade: string | null;
  edificios: string | null;
  stock: number;
  preco: number | null;
  destinos: string[];
  fotos: string[];
  estadoOrigem: string | null;
};

const RAW_KEYS = [
  'ID_PRODUTO',
  'CODIGO_SLIDE',
  'DESIGNACAO',
  'CATEGORIA',
  'MEDIDAS',
  'FORMATO',
  'GRADE',
  'EDIFICIOS',
  'QTD_TOTAL',
  'VALOR_SUGERIDO',
  'DESTINOS',
  'FOTOS',
  'ESTADO',
] as const;

type RawRecord = Partial<Record<(typeof RAW_KEYS)[number], unknown>>;

/** Converte um valor de origem desconhecida (string, número, null, …) para texto aparado. */
function toStr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

/** Normaliza um campo que pode vir como lista ('a/b'), array (JSON) ou vazio. */
function toList(v: unknown, separator: string): string[] {
  if (Array.isArray(v)) return v.map((x) => toStr(x) ?? '').filter(Boolean);
  const s = toStr(v);
  if (!s) return [];
  return s
    .split(separator)
    .map((x) => x.trim())
    .filter(Boolean);
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = toStr(v);
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(r: RawRecord): ImportRow | null {
  const external_id = toStr(r.ID_PRODUTO);
  if (!external_id) return null;
  const estadoOrigem = toStr(r.ESTADO) || null;
  return {
    external_id,
    codigo_slide: toStr(r.CODIGO_SLIDE) || null,
    nome: toStr(r.DESIGNACAO) || external_id,
    categoria: toStr(r.CATEGORIA) || null,
    medidas: toStr(r.MEDIDAS) || null,
    formato: toStr(r.FORMATO) || null,
    grade: toStr(r.GRADE) || null,
    edificios: toStr(r.EDIFICIOS) || null,
    stock: Math.max(0, Math.round(toNumberOrNull(r.QTD_TOTAL) ?? 0)),
    preco: toNumberOrNull(r.VALOR_SUGERIDO),
    destinos: toList(r.DESTINOS, '/').map((s) => s.toUpperCase()),
    fotos: toList(r.FOTOS, ';'),
    estadoOrigem,
  };
}

export function parseProdutosJson(text: string): ImportRow[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('produtos_site.json: esperava uma lista de produtos');
  return data.map((r) => normalizeRow(r as RawRecord)).filter((r): r is ImportRow => r !== null);
}

/** Parser CSV simples: separador ';', suporta campos entre aspas com ';' ou '"' escapado ("" ). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ';') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function parseProdutosCsv(text: string): ImportRow[] {
  const cleaned = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const lines = cleaned.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toUpperCase());
  const rows: ImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const record: RawRecord = {};
    headers.forEach((h, i) => {
      if ((RAW_KEYS as readonly string[]).includes(h)) {
        (record as Record<string, string>)[h] = cells[i] ?? '';
      }
    });
    const row = normalizeRow(record);
    if (row) rows.push(row);
  }
  return rows;
}

export const GRADE_TO_ESTADO: Record<string, 'Novo' | 'Como novo' | 'Bom'> = {
  A: 'Novo',
  B: 'Como novo',
  C: 'Bom',
  D: 'Bom',
};

export function estadoFromGrade(grade: string | null): 'Novo' | 'Como novo' | 'Bom' {
  if (!grade) return 'Bom';
  return GRADE_TO_ESTADO[grade.trim().toUpperCase()] ?? 'Bom';
}

/** Regra de publicação automática — devolve `null` se pode publicar, ou os motivos (para review_status) se não. */
export function reviewStatusFor(row: ImportRow, fotosEncontradas: number): string | null {
  const motivos: string[] = [];
  if (!row.destinos.includes('COLABORADORES')) motivos.push('não destinado a colaboradores');
  if (row.preco === null) motivos.push('sem preço');
  if (fotosEncontradas === 0) motivos.push('sem fotografias');
  if (row.estadoOrigem && !row.estadoOrigem.toUpperCase().startsWith('OK')) motivos.push(`inventário: ${row.estadoOrigem}`);
  return motivos.length ? motivos.join('; ') : null;
}
