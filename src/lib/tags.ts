import type { SupabaseClient } from '@supabase/supabase-js';
import { slugify } from './text';
import type { Tag } from '../types';

/**
 * Vai buscar a etiqueta com este nome dentro da categoria (comparando por slug) ou
 * cria-a se não existir. `cache` evita duplicados e chamadas repetidas à Supabase
 * durante uma importação em massa — passa sempre o mesmo mapa entre chamadas.
 */
export async function getOrCreateTag(
  supabase: SupabaseClient,
  categoryId: string,
  nomeBruto: string,
  cache: Map<string, Tag>,
  opts: { ordemSeguinte?: number } = {},
): Promise<Tag> {
  const nome = nomeBruto.trim();
  const slug = slugify(nome);
  const cacheKey = `${categoryId}:${slug}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const { data: existing, error: findError } = await supabase
    .from('tags')
    .select('*')
    .eq('category_id', categoryId)
    .eq('slug', slug)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) {
    cache.set(cacheKey, existing as Tag);
    return existing as Tag;
  }

  const { data: created, error: insertError } = await supabase
    .from('tags')
    .insert({ category_id: categoryId, nome, slug, ordem: opts.ordemSeguinte ?? 999 })
    .select('*')
    .single();
  if (insertError) throw insertError;

  cache.set(cacheKey, created as Tag);
  return created as Tag;
}
