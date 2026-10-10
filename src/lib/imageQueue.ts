// Corre o tratamento de imagem (imagePipeline.ts) num pool de Web Workers partilhado,
// para não bloquear a interface. Até POOL_SIZE fotos podem estar a ser processadas ao
// mesmo tempo (importação em massa, "Reprocessar todas as imagens" em Produtos.tsx
// despacham várias em paralelo; o upload manual de uma única foto só usa um worker).
import type { ProcessedImage } from './imagePipeline';
import type { WorkerRequest, WorkerResponse } from './imagePipeline.worker';
import type { Enquadramento } from '../types';

const POOL_SIZE = 4;
// Uma foto nunca deve demorar minutos a processar; se demorar, está presa (ficheiro
// corrompido ou peso incomum) — ao desistir ao fim deste tempo, uma única foto má não
// trava para sempre o resto de um lote de centenas/milhares de fotos.
const WORKER_TIMEOUT_MS = 45_000;

const workers: Worker[] = [];
let rrIndex = 0;
let nextMsgId = 0;

function createWorker() {
  return new Worker(new URL('./imagePipeline.worker.ts', import.meta.url), { type: 'module' });
}

function getWorker(): Worker {
  if (workers.length < POOL_SIZE) {
    const w = createWorker();
    workers.push(w);
    return w;
  }
  const w = workers[rrIndex % workers.length];
  rrIndex++;
  return w;
}

/** Substitui um worker que ficou preso ou em erro, para não voltar a ser usado. */
function replaceWorker(dead: Worker) {
  dead.terminate();
  const idx = workers.indexOf(dead);
  if (idx !== -1) workers.splice(idx, 1);
}

/** Liberta o pool de workers — chamar quando uma importação/reprocessamento termina. */
export function terminateImageWorker() {
  for (const w of workers) w.terminate();
  workers.length = 0;
  rrIndex = 0;
}

type RequestWithoutId = WorkerRequest extends infer T ? (T extends { id: number } ? Omit<T, 'id'> : never) : never;

function send(req: RequestWithoutId): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    const id = nextMsgId++;
    let settled = false;

    const cleanup = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      clearTimeout(timer);
    };
    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id !== id) return;
      settled = true;
      cleanup();
      resolve(e.data);
    };
    const onError = (e: ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      replaceWorker(worker);
      reject(new Error(e.message));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      replaceWorker(worker);
      reject(new Error('tempo_esgotado_a_processar_imagem'));
    }, WORKER_TIMEOUT_MS);

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ ...req, id } as WorkerRequest);
  });
}

/** Processa uma foto (orientação/corte/versões/quality flags). */
export async function processOneInWorker(file: File | Blob): Promise<ProcessedImage> {
  const res = await send({ kind: 'process', file });
  if (res.ok && res.kind === 'process') return res.result;
  throw new Error(!res.ok ? res.error : 'resposta_inesperada_do_worker');
}

/** Recalcula medium/thumb de uma única foto a partir de uma caixa escolhida à mão. */
export async function regenerateInWorker(file: File | Blob, box: Enquadramento) {
  const res = await send({ kind: 'regenerate', file, box });
  if (res.ok && res.kind === 'regenerate') return res.result;
  throw new Error(!res.ok ? res.error : 'resposta_inesperada_do_worker');
}
