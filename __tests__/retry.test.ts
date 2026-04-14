import { withRetry } from '../src/utils/retry';
import { ThumbifyError } from '../src/types';

describe('withRetry', () => {
  it('returns on first success', async () => {
    let calls = 0;
    const result = await withRetry(() => { calls++; return Promise.resolve(99); }, {});
    expect(result).toBe(99);
    expect(calls).toBe(1);
  });

  it('retries on NETWORK_ERROR', async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      if (calls < 3) throw new ThumbifyError('NETWORK_ERROR', 'fail');
      return Promise.resolve('ok');
    };
    const result = await withRetry(fn, { maxAttempts: 3, initialDelay: 1 });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('does not retry non-retryable errors', async () => {
    let calls = 0;
    const fn = () => { calls++; throw new ThumbifyError('DECODE_FAILED', 'bad codec'); };
    await expect(withRetry(fn, { maxAttempts: 3, initialDelay: 1 })).rejects.toThrow('bad codec');
    expect(calls).toBe(1);
  });

  it('passes through when config is false', async () => {
    let calls = 0;
    await withRetry(() => { calls++; return Promise.resolve(1); }, false);
    expect(calls).toBe(1);
  });

  it('respects AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      withRetry(() => Promise.resolve(1), {}, controller.signal)
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
