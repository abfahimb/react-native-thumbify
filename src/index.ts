export { ThumbnailGenerator } from './ThumbnailGenerator';
export { ThumbifyError } from './types';
export type {
  ThumbnailOptions,
  ThumbnailResult,
  BatchItem,
  BatchOptions,
  BatchResult,
  TimelineOptions,
  ThumbifyConfig,
  CacheConfig,
  RetryConfig,
  OutputFormat,
  ProgressEvent,
  GenerationStatus,
  ThumbifyErrorCode,
} from './types';

// ─── Singleton convenience API ────────────────────────────────────────────────

import { ThumbnailGenerator } from './ThumbnailGenerator';
import type { ThumbifyConfig, ThumbnailOptions, BatchItem, BatchOptions, TimelineOptions } from './types';

let _defaultInstance: ThumbnailGenerator | null = null;

function getDefault(): ThumbnailGenerator {
  if (!_defaultInstance) {
    _defaultInstance = new ThumbnailGenerator();
  }
  return _defaultInstance;
}

/**
 * Configure the default singleton instance.
 * Call once at app startup.
 */
export function configure(config: ThumbifyConfig): void {
  _defaultInstance = new ThumbnailGenerator(config);
}

/**
 * Generate a single thumbnail using the default instance.
 */
export function generateThumbnail(options: ThumbnailOptions) {
  return getDefault().generate(options);
}

/**
 * Generate thumbnails in batch using the default instance.
 */
export function generateBatch(items: BatchItem[], opts?: BatchOptions) {
  return getDefault().generateBatch(items, opts);
}

/**
 * Generate timeline frames using the default instance.
 */
export function generateTimeline(options: TimelineOptions) {
  return getDefault().generateTimeline(options);
}

/**
 * Clear in-memory cache of default instance.
 */
export function clearMemoryCache() {
  return getDefault().clearMemoryCache();
}

/**
 * Clear disk cache of default instance.
 */
export function clearDiskCache() {
  return getDefault().clearDiskCache();
}
