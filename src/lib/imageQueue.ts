// Corre o tratamento de imagem (imagePipeline.ts) num Web Worker partilhado, para não
// bloquear a interface — mas sempre uma foto de cada vez (importação em massa,
// "Reprocessar todas as imagens" e o upload manual em Produtos.tsx colocam as fotos
// sequencialmente, uma a seguir à outra).
import type { ProcessedImage } from './imagePipeline';
import type { WorkerRequest, WorkerResponse } from './imagePipeline.worker';
import type { Enquadramento } from '../types';

let sharedWorker: Worker | null = null;
let nextMsgId = 0;

function getWorker() {
  if (!sharedWorker) {
    sharedWorker = new Worker(new URL('./imagePipeline.worker.ts', import.meta.url), { type: 'module' });
  }
  return sharedWorker;
}

/** Liberta o worker partilhado — chamar quando uma importação/reprocessamento termina. */
export function terminateImageWorker() {
  sharedWorker?.terminate();
  sharedWorker = null;
}

type RequestWithoutId = WorkerRequest extends infer T ? (T extends { id: number } ? Omit<T, 'id'> : never) : never;

function send(req: RequestWithoutId): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    const id = nextMsgId++;
    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id !== id) return;
      worker.removeEventListener('message', onMessage);
      resolve(e.data);
    };
    const onError = (e: ErrorEvent) => {
      worker.removeEventListener('message', onMessage);
      reject(new Error(e.message));
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError, { once: true });
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
