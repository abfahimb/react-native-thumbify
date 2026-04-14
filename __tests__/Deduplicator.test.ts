import { Deduplicator } from '../src/utils/dedup';

describe('Deduplicator', () => {
  it('shares in-flight requests', async () => {
    const dedup = new Deduplicator<number>();
    let callCount = 0;

    const factory = () => {
      callCount++;
      return new Promise<number>((r) => setTimeout(() => r(42), 30));
    };

    const [a, b, c] = await Promise.all([
      dedup.get('key', factory),
      dedup.get('key', factory),
      dedup.get('key', factory),
    ]);

    expect(callCount).toBe(1);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(c).toBe(42);
  });

  it('allows new request after first completes', async () => {
    const dedup = new Deduplicator<number>();
    let callCount = 0;
    const factory = () => Promise.resolve(++callCount);

    await dedup.get('key', factory);
    await dedup.get('key', factory);

    expect(callCount).toBe(2);
  });

  it('cleans up after rejection', async () => {
    const dedup = new Deduplicator<number>();
    const factory = () => Promise.reject(new Error('boom'));

    await expect(dedup.get('key', factory)).rejects.toThrow('boom');
    expect(dedup.has('key')).toBe(false);
  });
});
