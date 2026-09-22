import type { SupabaseClient } from '@supabase/supabase-js';
import { slugify } from './text';
import type { Category } from '../types';

const SEM_CATEGORIA = 'Sem categoria';

/**
 * Vai buscar a categoria com este nome (comparando por slug, ignora maiúsculas/acentos/
 * espaços a mais) ou cria-a se não existir. `cache` evita duplicados e chamadas repetidas
 * à Supabase durante uma importação em massa — passa sempre o mesmo mapa entre chamadas.
 */
export async function getOrCreateCategory(
  supabase: SupabaseClient,
  nomeBruto: string | null | undefined,
  cache: Map<string, Category>,
  opts: { createdByImport?: boolean; ordemSeguinte?: number } = {},
): Promise<Category> {
  const nome = nomeBruto?.trim() || SEM_CATEGORIA;
  const slug = slugify(nome) || slugify(SEM_CATEGORIA);

  const cached = cache.get(slug);
  if (cached) return cached;

  const { data: existing, error: findError } = await supabase.from('categories').select('*').eq('slug', slug).maybeSingle();
  if (findError) throw findError;
  if (existing) {
    cache.set(slug, existing as Category);
    return existing as Category;
  }

  const { data: created, error: insertError } = await supabase
    .from('categories')
    .insert({
      nome,
      slug,
      ordem: opts.ordemSeguinte ?? 999,
      created_by_import: opts.createdByImport ?? false,
    })
    .select('*')
    .single();
  if (insertError) throw insertError;

  cache.set(slug, created as Category);
  return created as Category;
}
