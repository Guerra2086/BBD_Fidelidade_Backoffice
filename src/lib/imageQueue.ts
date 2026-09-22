// Fila de processamento de imagens sobre um pool pequeno de Web Workers, para não
// bloquear a interface com centenas de fotos (importação em massa, "Reprocessar todas as
// imagens") nem com o upload manual em Produtos.tsx — mesmo caminho de código para tudo.
import type { ProcessedImage } from './imagePipeline';
import type { WorkerRequest, WorkerResponse } from './imagePipeline.worker';
import type { Enquadramento } from '../types';

const MAX_WORKERS = 4;

function poolSize(taskCount: number) {
  const cpu = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(MAX_WORKERS, cpu, taskCount));
}

function makeWorker() {
  return new Worker(new URL('./imagePipeline.worker.ts', import.meta.url), { type: 'module' });
}

export type ProcessTask = { id: string; file: File | Blob };
export type ProcessOutcome = { id: string; result?: ProcessedImage; error?: string };

/** Processa várias fotos (orientação/corte/versões/quality flags) num pool de workers. */
export async function runImagePipeline(
  tasks: ProcessTask[],
  opts: { concurrency?: number; onItem?: (outcome: ProcessOutcome) => void; signal?: AbortSignal } = {},
): Promise<Map<string, ProcessOutcome>> {
  const results = new Map<string, ProcessOutcome>();
  if (tasks.length === 0) return results;

  const size = Math.max(1, Math.min(opts.concurrency ?? MAX_WORKERS, poolSize(tasks.length)));
  const workers = Array.from({ length: size }, makeWorker);
  let cursor = 0;
  let nextMsgId = 0;

  try {
    await Promise.all(
      workers.map(
        (worker) =>
          new Promise<void>((resolveWorker) => {
            const runNext = () => {
              if (opts.signal?.aborted || cursor >= tasks.length) {
                worker.terminate();
                resolveWorker();
                return;
              }
              const task = tasks[cursor++];
              const msgId = nextMsgId++;
              const onMessage = (e: MessageEvent<WorkerResponse>) => {
                if (e.data.id !== msgId) return;
                worker.removeEventListener('message', onMessage);
                const outcome: ProcessOutcome = e.data.ok
                  ? { id: task.id, result: e.data.kind === 'process' ? (e.data.result as ProcessedImage) : undefined }
                  : { id: task.id, error: e.data.error };
                results.set(task.id, outcome);
                opts.onItem?.(outcome);
                runNext();
              };
              worker.addEventListener('message', onMessage);
              const req: WorkerRequest = { id: msgId, kind: 'process', file: task.file };
              worker.postMessage(req);
            };
            runNext();
          }),
      ),
    );
  } finally {
    for (const w of workers) w.terminate();
  }

  return results;
}

/** Recalcula medium/thumb de uma única foto a partir de uma caixa escolhida à mão. */
export function regenerateInWorker(file: File | Blob, box: Enquadramento) {
  return new Promise<{ medium: ProcessedImage['medium']; thumb: ProcessedImage['thumb'] }>((resolve, reject) => {
    const worker = makeWorker();
    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      worker.removeEventListener('message', onMessage);
      worker.terminate();
      if (e.data.ok && e.data.kind === 'regenerate') resolve(e.data.result);
      else reject(new Error(!e.data.ok ? e.data.error : 'resposta_inesperada_do_worker'));
    };
    worker.addEventListener('message', onMessage);
    const req: WorkerRequest = { id: 0, kind: 'regenerate', file, box };
    worker.postMessage(req);
  });
}
