// ─── Output Formats ──────────────────────────────────────────────────────────

export type OutputFormat = 'jpeg' | 'png' | 'webp';

// ─── Cache Config ─────────────────────────────────────────────────────────────

export interface CacheConfig {
  /** Max number of entries. Default: 200 */
  maxEntries?: number;
  /** TTL in ms. Default: 30 minutes */
  ttl?: number;
  /** Max total disk size in bytes. Default: 100MB */
  maxDiskSize?: number;
  /** Custom cache directory. Default: system temp */
  directory?: string;
}

// ─── Retry Config ────────────────────────────────────────────────────────────

export interface RetryConfig {
  /** Max retry attempts. Default: 3 */
  maxAttempts?: number;
  /** Initial delay in ms. Default: 300 */
  initialDelay?: number;
  /** Backoff multiplier. Default: 2 */
  multiplier?: number;
  /** Max delay in ms. Default: 5000 */
  maxDelay?: number;
}

// ─── Single Thumbnail Options ─────────────────────────────────────────────────

export interface ThumbnailOptions {
  /** Video URI — local file or remote URL */
  uri: string;
  /** Timestamp in milliseconds. Default: 0 */
  timeMs?: number;
  /** Output format. Default: 'jpeg' */
  format?: OutputFormat;
  /** JPEG/WebP quality 0–100. Default: 80 */
  quality?: number;
  /** Max width in pixels. Aspect ratio preserved */
  maxWidth?: number;
  /** Max height in pixels. Aspect ratio preserved */
  maxHeight?: number;
  /** HTTP headers (Bearer tokens, auth, etc.) */
  headers?: Record<string, string>;
  /** Request timeout in ms. Default: 15000 */
  timeoutMs?: number;
  /** Retry config. Pass false to disable */
  retry?: RetryConfig | false;
  /** Skip cache lookup (always regenerate) */
  forceRefresh?: boolean;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

// ─── Thumbnail Result ─────────────────────────────────────────────────────────

export interface ThumbnailResult {
  /** Absolute path to generated thumbnail file */
  path: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** File size in bytes */
  size: number;
  /** Whether result was served from cache */
  fromCache: boolean;
  /** Time taken in ms */
  durationMs: number;
}

// ─── Batch Options ────────────────────────────────────────────────────────────

export interface BatchItem extends ThumbnailOptions {
  /** Optional ID to correlate result */
  id?: string;
}

export interface BatchOptions {
  /** Max parallel generations. Default: 3 */
  concurrency?: number;
  /** Callback per completed item */
  onItemComplete?: (result: BatchResult, index: number) => void;
  /** AbortSignal cancels entire batch */
  signal?: AbortSignal;
}

export type BatchResult =
  | { status: 'fulfilled'; id?: string; value: ThumbnailResult }
  | { status: 'rejected'; id?: string; reason: ThumbifyError };

// ─── Timeline Options ─────────────────────────────────────────────────────────

export interface TimelineOptions extends Omit<ThumbnailOptions, 'timeMs'> {
  /** Number of frames to extract. Default: 10 */
  frameCount?: number;
  /** Start time in ms. Default: 0 */
  startMs?: number;
  /** End time in ms. Default: video duration */
  endMs?: number;
  /** Explicit timestamps in ms (overrides frameCount/start/end) */
  timestamps?: number[];
  /** Batch concurrency for timeline. Default: 4 */
  concurrency?: number;
  /** Callback per frame ready */
  onFrameReady?: (result: ThumbnailResult, index: number) => void;
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export type GenerationStatus =
  | 'queued'
  | 'downloading'
  | 'extracting'
  | 'encoding'
  | 'caching'
  | 'done';

export interface ProgressEvent {
  status: GenerationStatus;
  /** 0–100 */
  percent: number;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export type ThumbifyErrorCode =
  | 'INVALID_URI'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'UNSUPPORTED_FORMAT'
  | 'DECODE_FAILED'
  | 'ENCODE_FAILED'
  | 'PERMISSION_DENIED'
  | 'DISK_FULL'
  | 'NATIVE_ERROR'
  | 'UNKNOWN';

export class ThumbifyError extends Error {
  readonly code: ThumbifyErrorCode;
  readonly uri?: string;
  readonly cause?: unknown;

  constructor(code: ThumbifyErrorCode, message: string, opts?: { uri?: string; cause?: unknown }) {
    super(message);
    this.name = 'ThumbifyError';
    this.code = code;
    this.uri = opts?.uri;
    this.cause = opts?.cause;
  }
}

// ─── Generator Config ─────────────────────────────────────────────────────────

export interface ThumbifyConfig {
  cache?: CacheConfig | false;
  retry?: RetryConfig | false;
  /** Default format. Default: 'jpeg' */
  defaultFormat?: OutputFormat;
  /** Default quality. Default: 80 */
  defaultQuality?: number;
  /** Default timeout in ms. Default: 15000 */
  defaultTimeoutMs?: number;
  /** Enable debug logging */
  debug?: boolean;
}
