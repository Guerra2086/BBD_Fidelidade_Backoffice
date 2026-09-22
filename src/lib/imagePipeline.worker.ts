// Worker fino: corre o tratamento de imagem (imagePipeline.ts) fora da thread principal,
// para importações de centenas de fotos não bloquearem a interface. Ver imageQueue.ts.
import { processImage, regenerateSquares } from './imagePipeline';

export type WorkerRequest =
  | { id: number; kind: 'process'; file: File | Blob }
  | { id: number; kind: 'regenerate'; file: File | Blob; box: { x: number; y: number; w: number; h: number } };

export type WorkerResponse =
  | { id: number; ok: true; kind: 'process'; result: Awaited<ReturnType<typeof processImage>> }
  | { id: number; ok: true; kind: 'regenerate'; result: Awaited<ReturnType<typeof regenerateSquares>> }
  | { id: number; ok: false; error: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.kind === 'process') {
      const result = await processImage(msg.file);
      const response: WorkerResponse = { id: msg.id, ok: true, kind: 'process', result };
      (self as unknown as Worker).postMessage(response);
    } else {
      const result = await regenerateSquares(msg.file, msg.box);
      const response: WorkerResponse = { id: msg.id, ok: true, kind: 'regenerate', result };
      (self as unknown as Worker).postMessage(response);
    }
  } catch (err) {
    const response: WorkerResponse = { id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) };
    (self as unknown as Worker).postMessage(response);
  }
};
