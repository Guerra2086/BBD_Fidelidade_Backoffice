// Tratamento automático de fotos de produto: corrige orientação, corta margens
// inúteis, deteta a caixa do objeto e gera 3 versões (large/medium/thumb) em que o
// objeto aparece sempre inteiro e centrado — nunca cortado. Usa só OffscreenCanvas,
// por isso corre tanto na thread principal como dentro de um Web Worker (ver
// imagePipeline.worker.ts / imageQueue.ts), tanto na importação em massa como no
// upload manual de fotos em Produtos.tsx.
import type { Enquadramento, QualityFlags } from '../types';

export const LARGE_MAX = 1600;
export const MEDIUM_SIZE = 800;
export const THUMB_SIZE = 300;
const MARGIN = 0.06;
const ZOOM_THRESHOLD = 0.5; // objeto a ocupar menos disto da caixa -> aplica zoom
const BORDER_UNIFORM_TOLERANCE = 12; // diferença de cor (0-255) para considerar uma linha "lisa"
const BG_DISTANCE_THRESHOLD = 28; // diferença de cor para considerar um pixel "objeto"
const EDGE_TOUCH_MARGIN = 0.01; // 1% da imagem
const WEBP_QUALITY = 0.85;

export type RGB = { r: number; g: number; b: number };

export type ImageVariant = { blob: Blob; width: number; height: number };

export type ProcessedImage = {
  original: Blob;
  large: ImageVariant;
  medium: ImageVariant;
  thumb: ImageVariant;
  width: number;
  height: number;
  quality_flags: QualityFlags;
  enquadramento: Enquadramento | null;
  dhash: string;
};

function makeCanvas(w: number, h: number) {
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  return { canvas, ctx };
}

async function loadBitmap(file: File | Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Navegadores sem suporte a imageOrientation ainda decodificam a imagem, só
    // podem não corrigir a rotação EXIF — melhor que falhar.
    return await createImageBitmap(file);
  }
}

function colorDistance(a: RGB, b: RGB) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function pixelAt(data: Uint8ClampedArray, w: number, x: number, y: number): RGB {
  const i = (y * w + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

/** Amostra as 4 esquinas para estimar a cor de fundo e se o fundo parece uniforme. */
function estimateBackground(data: Uint8ClampedArray, w: number, h: number): { color: RGB; uniform: boolean } {
  const patch = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  const corners: RGB[] = [];
  for (const [ox, oy] of [
    [0, 0],
    [w - patch, 0],
    [0, h - patch],
    [w - patch, h - patch],
  ]) {
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let y = oy; y < oy + patch; y++) {
      for (let x = ox; x < ox + patch; x++) {
        const p = pixelAt(data, w, x, y);
        r += p.r;
        g += p.g;
        b += p.b;
        n++;
      }
    }
    corners.push({ r: r / n, g: g / n, b: b / n });
  }
  const avg: RGB = {
    r: corners.reduce((s, c) => s + c.r, 0) / corners.length,
    g: corners.reduce((s, c) => s + c.g, 0) / corners.length,
    b: corners.reduce((s, c) => s + c.b, 0) / corners.length,
  };
  const maxDist = Math.max(...corners.map((c) => colorDistance(c, avg)));
  return { color: avg, uniform: maxDist < BORDER_UNIFORM_TOLERANCE * 1.5 };
}

/** Corta margens de cor lisa à volta da imagem (faixas brancas/pretas/lisas). */
function trimUniformBorders(data: Uint8ClampedArray, w: number, h: number, bg: RGB) {
  const isRowUniform = (y: number) => {
    let maxDist = 0;
    for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 200))) {
      const d = colorDistance(pixelAt(data, w, x, y), bg);
      if (d > maxDist) maxDist = d;
      if (maxDist > BORDER_UNIFORM_TOLERANCE) return false;
    }
    return true;
  };
  const isColUniform = (x: number) => {
    let maxDist = 0;
    for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 200))) {
      const d = colorDistance(pixelAt(data, w, x, y), bg);
      if (d > maxDist) maxDist = d;
      if (maxDist > BORDER_UNIFORM_TOLERANCE) return false;
    }
    return true;
  };

  let top = 0,
    bottom = h - 1,
    left = 0,
    right = w - 1;
  const maxTrim = 0.25; // nunca corta mais de 25% de cada lado — protege contra falsos positivos
  while (top < h * maxTrim && top < bottom && isRowUniform(top)) top++;
  while (bottom > h * (1 - maxTrim) && bottom > top && isRowUniform(bottom)) bottom--;
  while (left < w * maxTrim && left < right && isColUniform(left)) left++;
  while (right > w * (1 - maxTrim) && right > left && isColUniform(right)) right--;

  const rect = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  if (rect.w < w * 0.5 || rect.h < h * 0.5) {
    // Corte agressivo demais é sinal de deteção errada — na dúvida, não corta.
    return { x: 0, y: 0, w, h };
  }
  return rect;
}

/** Deteta a caixa do objeto principal por diferença de cor ao fundo estimado. */
function detectObjectBox(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bg: RGB,
): { box: Enquadramento; reliable: boolean } {
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  let fgCount = 0;
  const step = Math.max(1, Math.floor(Math.max(w, h) / 400));
  let sampled = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      sampled++;
      if (colorDistance(pixelAt(data, w, x, y), bg) > BG_DISTANCE_THRESHOLD) {
        fgCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const fgFraction = fgCount / Math.max(1, sampled);
  const reliable = fgFraction > 0.01 && fgFraction < 0.98 && minX < maxX && minY < maxY;
  if (!reliable) {
    return { box: { x: 0, y: 0, w: 1, h: 1 }, reliable: false };
  }
  return {
    box: { x: minX / w, y: minY / h, w: (maxX - minX) / w, h: (maxY - minY) / h },
    reliable: true,
  };
}

function computeBrightness(data: Uint8ClampedArray) {
  let sum = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / n / 255;
}

/** Variância do Laplaciano (medida de nitidez) numa versão pequena em cinzentos. */
function computeBlurVariance(data: Uint8ClampedArray, w: number, h: number) {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  const lap: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = gray[y * w + x];
      const v = gray[(y - 1) * w + x] + gray[(y + 1) * w + x] + gray[y * w + x - 1] + gray[y * w + x + 1] - 4 * c;
      lap.push(v);
    }
  }
  const mean = lap.reduce((s, v) => s + v, 0) / lap.length;
  return lap.reduce((s, v) => s + (v - mean) ** 2, 0) / lap.length;
}

/** dHash percetual (64 bits, em hex) — usado para detetar fotos duplicadas do mesmo produto. */
function computeDHash(bitmap: ImageBitmap): string {
  const { ctx } = makeCanvas(9, 8);
  ctx.drawImage(bitmap, 0, 0, 9, 8);
  const { data } = ctx.getImageData(0, 0, 9, 8);
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += gray[y * 9 + x] < gray[y * 9 + x + 1] ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

export function hammingDistanceHex(a: string, b: string): number {
  let dist = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/** Marca como duplicadas as fotos cujo dHash está muito próximo de outra do mesmo produto. */
export function flagDuplicates(items: { id: string; dhash: string }[]): Set<string> {
  const dup = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (hammingDistanceHex(items[i].dhash, items[j].dhash) <= 8) {
        dup.add(items[i].id);
        dup.add(items[j].id);
      }
    }
  }
  return dup;
}

function canvasToBlob(canvas: OffscreenCanvas, quality = WEBP_QUALITY): Promise<Blob> {
  return canvas.convertToBlob({ type: 'image/webp', quality });
}

/** Redimensiona preservando a proporção, sem cortar (para a versão "large"). */
function renderLarge(source: OffscreenCanvas, srcW: number, srcH: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

function supportsCanvasFilter(ctx: OffscreenCanvasRenderingContext2D) {
  return 'filter' in ctx;
}

/**
 * Gera uma versão quadrada com o objeto sempre inteiro dentro (letterbox). O
 * espaço à volta é preenchido com a cor de fundo estimada ou, se o fundo não for
 * uniforme, uma cópia desfocada da própria foto (quando o browser suportar
 * `ctx.filter`; caso contrário cai para a cor de fundo estimada).
 */
function renderSquare(
  source: OffscreenCanvas,
  srcRect: { x: number; y: number; w: number; h: number },
  size: number,
  bg: RGB,
  bgUniform: boolean,
) {
  const { canvas, ctx } = makeCanvas(size, size);

  if (bgUniform || !supportsCanvasFilter(ctx)) {
    ctx.fillStyle = `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`;
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.save();
    ctx.filter = 'blur(18px)';
    const scale = Math.max(size / srcRect.w, size / srcRect.h) * 1.15;
    const dw = srcRect.w * scale;
    const dh = srcRect.h * scale;
    ctx.drawImage(source, srcRect.x, srcRect.y, srcRect.w, srcRect.h, (size - dw) / 2, (size - dh) / 2, dw, dh);
    ctx.restore();
  }

  const avail = size * (1 - MARGIN * 2);
  const scale = Math.min(avail / srcRect.w, avail / srcRect.h);
  const dw = srcRect.w * scale;
  const dh = srcRect.h * scale;
  ctx.drawImage(source, srcRect.x, srcRect.y, srcRect.w, srcRect.h, (size - dw) / 2, (size - dh) / 2, dw, dh);

  return canvas;
}

/** Converte uma caixa (fração 0..1 do retângulo já sem margens) num retângulo em pixels, com zoom se for pequena. */
function boxToSrcRect(trimmed: { x: number; y: number; w: number; h: number }, box: Enquadramento, applyZoomMargin: boolean) {
  const zoomMargin = applyZoomMargin ? 0.15 : 0;
  const bx = Math.max(0, box.x - zoomMargin * box.w);
  const by = Math.max(0, box.y - zoomMargin * box.h);
  const bw = Math.min(1 - bx, box.w * (1 + zoomMargin * 2));
  const bh = Math.min(1 - by, box.h * (1 + zoomMargin * 2));
  return {
    x: trimmed.x + bx * trimmed.w,
    y: trimmed.y + by * trimmed.h,
    w: bw * trimmed.w,
    h: bh * trimmed.h,
  };
}

async function prepareCanvas(file: File | Blob) {
  const bitmap = await loadBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;

  const { canvas: fullCanvas, ctx: fullCtx } = makeCanvas(width, height);
  fullCtx.drawImage(bitmap, 0, 0);
  const fullData = fullCtx.getImageData(0, 0, width, height).data;

  const bg = estimateBackground(fullData, width, height);
  const trimmed = trimUniformBorders(fullData, width, height, bg.color);

  return { bitmap, fullCanvas, fullCtx, width, height, bg, trimmed };
}

export async function processImage(file: File | Blob): Promise<ProcessedImage> {
  const { bitmap, fullCanvas, fullCtx, width, height, bg, trimmed } = await prepareCanvas(file);

  // Reanalisa a caixa do objeto já sem as margens cortadas.
  const trimmedData = fullCtx.getImageData(trimmed.x, trimmed.y, trimmed.w, trimmed.h).data;
  const { box, reliable } = detectObjectBox(trimmedData, trimmed.w, trimmed.h, bg.color);

  const touchesEdge =
    reliable &&
    (box.x < EDGE_TOUCH_MARGIN || box.y < EDGE_TOUCH_MARGIN || box.x + box.w > 1 - EDGE_TOUCH_MARGIN || box.y + box.h > 1 - EDGE_TOUCH_MARGIN);

  // Retângulo de origem (em pixels, dentro da imagem já sem margens) para as versões
  // quadradas: a imagem inteira, ou um zoom à caixa do objeto se ele for pequeno.
  let srcRect = { x: trimmed.x, y: trimmed.y, w: trimmed.w, h: trimmed.h };
  if (reliable && box.w * box.h < ZOOM_THRESHOLD * ZOOM_THRESHOLD) {
    srcRect = boxToSrcRect(trimmed, box, true);
  }

  const smallW = 160;
  const smallH = Math.max(1, Math.round((height / width) * smallW));
  const { ctx: smallCtx } = makeCanvas(smallW, smallH);
  smallCtx.drawImage(bitmap, 0, 0, smallW, smallH);
  const smallData = smallCtx.getImageData(0, 0, smallW, smallH).data;

  const brightness = computeBrightness(smallData);
  const blurVariance = computeBlurVariance(smallData, smallW, smallH);
  const dhash = computeDHash(bitmap);

  const quality_flags: QualityFlags = {
    baixa_resolucao: Math.min(width, height) < 600,
    muito_escura: brightness < 0.15,
    muito_clara: brightness > 0.9,
    desfocada: blurVariance < 15,
    objeto_a_tocar_na_borda: touchesEdge,
  };

  // A versão large parte da imagem já sem margens uniformes (nunca corta o objeto).
  const { canvas: trimmedCanvas, ctx: trimmedCtx } = makeCanvas(trimmed.w, trimmed.h);
  trimmedCtx.drawImage(fullCanvas, trimmed.x, trimmed.y, trimmed.w, trimmed.h, 0, 0, trimmed.w, trimmed.h);
  const largeCanvas = renderLarge(trimmedCanvas, trimmed.w, trimmed.h, LARGE_MAX);

  const mediumCanvas = renderSquare(fullCanvas, srcRect, MEDIUM_SIZE, bg.color, bg.uniform);
  const thumbCanvas = renderSquare(fullCanvas, srcRect, THUMB_SIZE, bg.color, bg.uniform);

  const [largeBlob, mediumBlob, thumbBlob] = await Promise.all([
    canvasToBlob(largeCanvas),
    canvasToBlob(mediumCanvas),
    canvasToBlob(thumbCanvas),
  ]);

  return {
    original: file instanceof Blob ? file : new Blob([file]),
    large: { blob: largeBlob, width: largeCanvas.width, height: largeCanvas.height },
    medium: { blob: mediumBlob, width: MEDIUM_SIZE, height: MEDIUM_SIZE },
    thumb: { blob: thumbBlob, width: THUMB_SIZE, height: THUMB_SIZE },
    width,
    height,
    quality_flags,
    enquadramento: reliable ? box : null,
    dhash,
  };
}

/**
 * Regenera só as versões medium/thumb a partir do original e de uma caixa escolhida à
 * mão (mesmo referencial de `enquadramento`: fração 0..1 da imagem já sem margens,
 * como é mostrada em "Ajustar enquadramento"). Usada quando o admin corrige o
 * enquadramento de uma foto já importada.
 */
export async function regenerateSquares(file: File | Blob, box: Enquadramento): Promise<{ medium: ImageVariant; thumb: ImageVariant }> {
  const { fullCanvas, bg, trimmed } = await prepareCanvas(file);
  const srcRect = boxToSrcRect(trimmed, box, false);

  const mediumCanvas = renderSquare(fullCanvas, srcRect, MEDIUM_SIZE, bg.color, bg.uniform);
  const thumbCanvas = renderSquare(fullCanvas, srcRect, THUMB_SIZE, bg.color, bg.uniform);
  const [mediumBlob, thumbBlob] = await Promise.all([canvasToBlob(mediumCanvas), canvasToBlob(thumbCanvas)]);

  return {
    medium: { blob: mediumBlob, width: MEDIUM_SIZE, height: MEDIUM_SIZE },
    thumb: { blob: thumbBlob, width: THUMB_SIZE, height: THUMB_SIZE },
  };
}
