import { ThumbifyError } from '../types';

type Task<T> = () => Promise<T>;

/**
 * Bounded-concurrency task queue.
 * Runs up to `concurrency` tasks in parallel, queues the rest.
 */
export class TaskQueue {
  private concurrency: number;
  private running = 0;
  private queue: Array<{ task: Task<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];

  constructor(concurrency = 3) {
    this.concurrency = Math.max(1, concurrency);
  }

  add<T>(task: Task<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new ThumbifyError('CANCELLED', 'Task cancelled before queued'));
        return;
      }

      // Keep a reference to the abort handler so we can remove it when the
      // task settles — prevents listener accumulation on long-lived signals.
      let abortHandler: (() => void) | undefined;
      const cleanup = () => {
        if (abortHandler) signal?.removeEventListener('abort', abortHandler);
      };

      const entry: { task: Task<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void } = {
        task: task as Task<unknown>,
        resolve: (v) => { cleanup(); resolve(v as T); },
        reject:  (e) => { cleanup(); reject(e); },
      };

      this.queue.push(entry);

      if (signal) {
        abortHandler = () => {
          const idx = this.queue.findIndex((q) => q === entry);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            reject(new ThumbifyError('CANCELLED', 'Task cancelled while queued'));
          }
        };
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      this.drain();
    });
  }

  private drain(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.running++;
      item.task()
        .then(item.resolve)
        .catch(item.reject)
        .finally(() => {
          this.running--;
          this.drain();
        });
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.running;
  }
}
