import { CacheManager } from './cache/CacheManager';
import { TaskQueue } from './queue/TaskQueue';
import { Deduplicator } from './utils/dedup';
import { buildCacheFilename, buildCacheKey } from './utils/hash';
import { withRetry } from './utils/retry';
import { nativeClearCache, nativeGenerate } from './platforms/NativeThumbify';
import {
  ThumbifyError,
  type BatchItem,
  type BatchOptions,
  type BatchResult,
  type ThumbifyConfig,
  type ThumbnailOptions,
  type ThumbnailResult,
  type TimelineOptions,
} from './types';

export class ThumbnailGenerator {
  private cache: CacheManager | null;
  private dedup = new Deduplicator<ThumbnailResult>();
  private cfg: Required<Omit<ThumbifyConfig, 'cache' | 'retry'>> & Pick<ThumbifyConfig, 'cache' | 'retry'>;

  constructor(config: ThumbifyConfig = {}) {
    this.cache = config.cache === false ? null : new CacheManager(config.cache ?? {});
    this.cfg = {
      cache: config.cache,
      retry: config.retry,
      defaultFormat: config.defaultFormat ?? 'jpeg',
      defaultQuality: config.defaultQuality ?? 80,
      defaultTimeoutMs: config.defaultTimeoutMs ?? 15000,
      debug: config.debug ?? false,
    };
  }

  // ─── Single Thumbnail ───────────────────────────────────────────────────────

  async generate(options: ThumbnailOptions): Promise<ThumbnailResult> {
    this.validateUri(options.uri);

    const opts = this.applyDefaults(options);
    const cacheKey = buildCacheKey(opts);

    // Cache hit
    if (!opts.forceRefresh && this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.log(`Cache hit: ${opts.uri}`);
        return { ...cached, fromCache: true, durationMs: 0 };
      }
    }

    // Dedup: if identical request in flight, share the promise
    return this.dedup.get(cacheKey, () => this.execute(opts, cacheKey));
  }

  private async execute(opts: ThumbnailOptions, cacheKey: string): Promise<ThumbnailResult> {
    const start = Date.now();
    const cacheFilename = buildCacheFilename(opts);
    const cacheDir = this.cache?.directory ?? '';

    const retryConfig = opts.retry !== undefined ? opts.retry : this.cfg.retry;

    const raw = await withRetry(
      () => nativeGenerate(opts, cacheDir, cacheFilename),
      retryConfig,
      opts.signal,
    );

    const result: ThumbnailResult = {
      path: raw.path,
      width: raw.width,
      height: raw.height,
      size: raw.size,
      fromCache: false,
      durationMs: Date.now() - start,
    };

    if (this.cache) {
      this.cache.set(cacheKey, {
        path: raw.path,
        width: raw.width,
        height: raw.height,
        size: raw.size,
        diskSize: raw.size,
      });
    }

    this.log(`Generated in ${result.durationMs}ms: ${opts.uri}`);
    return result;
  }

  // ─── Batch ──────────────────────────────────────────────────────────────────

  async generateBatch(items: BatchItem[], opts: BatchOptions = {}): Promise<BatchResult[]> {
    const queue = new TaskQueue(opts.concurrency ?? 3);
    const results: BatchResult[] = new Array(items.length);

    await Promise.all(
      items.map((item, index) =>
        queue
          .add(() => this.generate(item), opts.signal ?? item.signal)
          .then((value) => {
            const r: BatchResult = { status: 'fulfilled', id: item.id, value };
            results[index] = r;
            opts.onItemComplete?.(r, index);
          })
          .catch((reason: unknown) => {
            const err = reason instanceof ThumbifyError
              ? reason
              : new ThumbifyError('UNKNOWN', String(reason));
            const r: BatchResult = { status: 'rejected', id: item.id, reason: err };
            results[index] = r;
            opts.onItemComplete?.(r, index);
          }),
      ),
    );

    return results;
  }

  // ─── Timeline ───────────────────────────────────────────────────────────────

  async generateTimeline(options: TimelineOptions): Promise<ThumbnailResult[]> {
    const {
      frameCount = 10,
      startMs = 0,
      endMs,
      timestamps,
      concurrency = 4,
      onFrameReady,
      ...baseOpts
    } = options;

    let times: number[];

    if (timestamps && timestamps.length > 0) {
      times = timestamps;
    } else {
      const end = endMs ?? 0; // 0 = native auto-detect duration
      if (end > 0 && end <= startMs) {
        throw new ThumbifyError('INVALID_URI', 'endMs must be greater than startMs');
      }
      const range = end > 0 ? end - startMs : null;
      if (frameCount === 1) {
        times = [startMs];
      } else {
        times = Array.from({ length: frameCount }, (_, i) =>
          range !== null
            ? Math.round(startMs + (range / (frameCount - 1)) * i)
            : Math.round(startMs + i * 1000), // fallback: 1s intervals
        );
      }
    }

    const batchItems: BatchItem[] = times.map((t) => ({ ...baseOpts, timeMs: t }));

    const batchResults = await this.generateBatch(batchItems, {
      concurrency,
      signal: options.signal,
      onItemComplete: (result, index) => {
        if (result.status === 'fulfilled') {
          onFrameReady?.(result.value, index);
        }
      },
    });

    const failed = batchResults.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      this.log(`generateTimeline: ${failed.length}/${batchResults.length} frames failed`);
      // If every frame failed, surface the first error so callers aren't left with an empty array
      if (failed.length === batchResults.length) {
        throw (failed[0] as Extract<BatchResult, { status: 'rejected' }>).reason;
      }
    }

    return batchResults
      .filter((r): r is Extract<BatchResult, { status: 'fulfilled' }> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  // ─── Cache Management ───────────────────────────────────────────────────────

  clearMemoryCache(): void {
    this.cache?.clear();
  }

  pruneExpired(): number {
    return this.cache?.prune() ?? 0;
  }

  async clearDiskCache(): Promise<void> {
    if (!this.cache) return;
    this.cache.clear();
    await nativeClearCache(this.cache.directory);
  }

  cacheStats() {
    return this.cache?.stats() ?? null;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private applyDefaults(opts: ThumbnailOptions): ThumbnailOptions {
    return {
      format: this.cfg.defaultFormat,
      quality: this.cfg.defaultQuality,
      timeoutMs: this.cfg.defaultTimeoutMs,
      ...opts,
    };
  }

  private validateUri(uri: string): void {
    if (!uri || typeof uri !== 'string' || uri.trim() === '') {
      throw new ThumbifyError('INVALID_URI', 'uri must be a non-empty string');
    }
  }

  private log(msg: string): void {
    if (this.cfg.debug) {
      console.log(`[Thumbify] ${msg}`);
    }
  }
}
