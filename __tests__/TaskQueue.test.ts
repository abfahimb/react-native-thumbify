import { TaskQueue } from '../src/queue/TaskQueue';

describe('TaskQueue', () => {
  it('runs tasks up to concurrency limit', async () => {
    const running: number[] = [];
    const maxConcurrent = { value: 0 };
    let current = 0;

    const queue = new TaskQueue(2);
    const tasks = Array.from({ length: 6 }, (_, i) =>
      queue.add(async () => {
        current++;
        maxConcurrent.value = Math.max(maxConcurrent.value, current);
        await new Promise((r) => setTimeout(r, 20));
        current--;
        return i;
      }),
    );

    await Promise.all(tasks);
    expect(maxConcurrent.value).toBeLessThanOrEqual(2);
  });

  it('returns correct values', async () => {
    const queue = new TaskQueue(3);
    const results = await Promise.all([
      queue.add(() => Promise.resolve(1)),
      queue.add(() => Promise.resolve(2)),
      queue.add(() => Promise.resolve(3)),
    ]);
    expect(results).toEqual([1, 2, 3]);
  });

  it('propagates errors without stopping queue', async () => {
    const queue = new TaskQueue(2);
    const p1 = queue.add(() => Promise.reject(new Error('fail')));
    const p2 = queue.add(() => Promise.resolve(42));
    await expect(p1).rejects.toThrow('fail');
    await expect(p2).resolves.toBe(42);
  });

  it('respects AbortSignal', async () => {
    const controller = new AbortController();
    const queue = new TaskQueue(1);

    // Fill slot
    const blocker = queue.add(() => new Promise((r) => setTimeout(r, 100)));
    // Queue a task then abort
    const queued = queue.add(() => Promise.resolve('ok'), controller.signal);
    controller.abort();

    await expect(queued).rejects.toThrow();
    await blocker;
  });
});
