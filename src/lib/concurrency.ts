/** Limitador de concorrência simples (sem dependência nova) — usado nos uploads da importação. */
export function pLimit(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    active--;
    const runNext = queue.shift();
    if (runNext) runNext();
  };
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const exec = () => {
        active++;
        fn().then(
          (v) => {
            resolve(v);
            next();
          },
          (e) => {
            reject(e);
            next();
          },
        );
      };
      if (active < concurrency) exec();
      else queue.push(exec);
    });
  };
}
