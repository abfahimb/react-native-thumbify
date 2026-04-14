import { ThumbifyError } from '../types';
import type { RetryConfig } from '../types';

const DEFAULT_RETRY: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelay: 300,
  multiplier: 2,
  maxDelay: 5000,
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ThumbifyError('CANCELLED', 'Cancelled before retry delay'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new ThumbifyError('CANCELLED', 'Cancelled during retry delay'));
    }, { once: true });
  });
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ThumbifyError) {
    return error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT';
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig | false | undefined,
  signal?: AbortSignal,
): Promise<T> {
  if (config === false) return fn();

  const cfg = { ...DEFAULT_RETRY, ...config };
  let lastError: unknown;
  let delay = cfg.initialDelay;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      if (signal?.aborted) {
        throw new ThumbifyError('CANCELLED', 'Request cancelled');
      }
      return await fn();
    } catch (err) {
      lastError = err;

      if (err instanceof ThumbifyError && err.code === 'CANCELLED') throw err;
      if (attempt === cfg.maxAttempts || !isRetryable(err)) break;

      await sleep(Math.min(delay, cfg.maxDelay), signal);
      delay *= cfg.multiplier;
    }
  }

  throw lastError;
}
