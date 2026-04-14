/**
 * Request deduplicator — if identical key is in-flight,
 * returns the same promise instead of launching a new request.
 */
export class Deduplicator<T> {
  private inflight = new Map<string, Promise<T>>();

  async get(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = factory().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  has(key: string): boolean {
    return this.inflight.has(key);
  }

  size(): number {
    return this.inflight.size;
  }
}
