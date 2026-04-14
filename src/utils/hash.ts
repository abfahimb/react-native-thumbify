import type { ThumbnailOptions } from '../types';

/**
 * Deterministic cache key from thumbnail options.
 * Same inputs = same key = cache hit.
 */
export function buildCacheKey(opts: ThumbnailOptions): string {
  const parts = [
    opts.uri,
    opts.timeMs ?? 0,
    opts.format ?? 'jpeg',
    opts.quality ?? 80,
    opts.maxWidth ?? 0,
    opts.maxHeight ?? 0,
  ];
  return parts.join('|');
}

/**
 * Simple djb2 hash → hex string. Fast, no crypto needed.
 */
export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}

export function buildCacheFilename(opts: ThumbnailOptions): string {
  const key = buildCacheKey(opts);
  const hash = hashString(key);
  const ext = opts.format ?? 'jpeg';
  return `thumbify_${hash}.${ext}`;
}
