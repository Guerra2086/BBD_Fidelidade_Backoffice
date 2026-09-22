import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProcessedImage } from './imagePipeline';

const BUCKET = 'product-images';

function extOf(file: File | Blob, fallback: string) {
  if (file instanceof File) {
    const m = /\.([a-z0-9]+)$/i.exec(file.name);
    if (m) return m[1].toLowerCase();
  }
  return fallback;
}

/** Nome curto e estável para o ficheiro de origem, usado para detetar se uma foto já foi importada (ver Importar.tsx). */
export function safeSourceName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function put(supabase: SupabaseClient, path: string, blob: Blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export type UploadedImagePaths = {
  original_path: string;
  large_path: string;
  medium_path: string;
  thumb_path: string;
  largura: number | null;
  altura: number | null;
};

/**
 * Envia as 4 versões de uma foto processada para o Storage e devolve os URLs públicos
 * para gravar em `product_images`. `sourceFilename` fica embutido no caminho para se
 * conseguir detetar, numa importação seguinte, que esta foto já foi tratada (retoma).
 */
export async function uploadProcessedImage(
  supabase: SupabaseClient,
  productId: string,
  sourceFilename: string,
  processed: ProcessedImage,
): Promise<UploadedImagePaths> {
  const base = `${productId}/${safeSourceName(sourceFilename)}`;
  const originalExt = extOf(processed.original, 'jpg');

  const [original_path, large_path, medium_path, thumb_path] = await Promise.all([
    put(supabase, `${base}-original.${originalExt}`, processed.original),
    put(supabase, `${base}-large.webp`, processed.large.blob),
    put(supabase, `${base}-medium.webp`, processed.medium.blob),
    put(supabase, `${base}-thumb.webp`, processed.thumb.blob),
  ]);

  return { original_path, large_path, medium_path, thumb_path, largura: processed.width, altura: processed.height };
}

/** Só reenvia medium/thumb — usado por "Ajustar enquadramento". */
export async function uploadRegeneratedSquares(
  supabase: SupabaseClient,
  productId: string,
  sourceFilename: string,
  squares: { medium: { blob: Blob }; thumb: { blob: Blob } },
): Promise<{ medium_path: string; thumb_path: string }> {
  const base = `${productId}/${safeSourceName(sourceFilename)}`;
  const [medium_path, thumb_path] = await Promise.all([
    put(supabase, `${base}-medium.webp`, squares.medium.blob),
    put(supabase, `${base}-thumb.webp`, squares.thumb.blob),
  ]);
  return { medium_path, thumb_path };
}

export async function deleteProductImageFiles(supabase: SupabaseClient, paths: (string | null | undefined)[]) {
  const keys = paths
    .filter((p): p is string => !!p)
    .map((url) => {
      const idx = url.indexOf(`/${BUCKET}/`);
      return idx >= 0 ? url.slice(idx + BUCKET.length + 2) : null;
    })
    .filter((p): p is string => !!p);
  if (keys.length === 0) return;
  await supabase.storage.from(BUCKET).remove(keys);
}
