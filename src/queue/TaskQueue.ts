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

      const wrappedResolve = (v: unknown) => resolve(v as T);
      this.queue.push({ task: task as Task<unknown>, resolve: wrappedResolve, reject });

      signal?.addEventListener('abort', () => {
        const idx = this.queue.findIndex((q) => q.resolve === wrappedResolve);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          reject(new ThumbifyError('CANCELLED', 'Task cancelled while queued'));
        }
      }, { once: true });

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
