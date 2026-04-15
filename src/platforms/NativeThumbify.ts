import { requireNativeModule } from 'expo-modules-core';
import { ThumbifyError } from '../types';
import type { ThumbnailOptions } from '../types';

interface NativeResult {
  path: string;
  width: number;
  height: number;
  size: number;
}

interface ThumbifyNativeModule {
  generate(options: {
    uri: string;
    timeMs: number;
    format: string;
    quality: number;
    maxWidth: number;
    maxHeight: number;
    headers: Record<string, string>;
    timeoutMs: number;
    cacheDir: string;
    cacheFilename: string;
  }): Promise<NativeResult>;

  clearCache(directory: string): Promise<void>;
  getCacheSize(directory: string): Promise<number>;
}

let _native: ThumbifyNativeModule | null = null;
try {
  _native = requireNativeModule<ThumbifyNativeModule>('Thumbify');
} catch {
  _native = null;
}

export function isNativeAvailable(): boolean {
  return _native !== null;
}

/**
 * Extract the error code from native error messages formatted as "CODE: message".
 * Falls back to keyword scanning for backward compatibility.
 */
function mapNativeError(err: unknown, uri: string): ThumbifyError {
  const raw = err instanceof Error ? err.message : String(err);
  const colonIdx = raw.indexOf(':');

  if (colonIdx > 0) {
    const prefix = raw.slice(0, colonIdx).trim();
    const message = raw.slice(colonIdx + 1).trim();
    const knownCodes = [
      'INVALID_URI', 'DECODE_FAILED', 'TIMEOUT', 'CANCELLED',
      'NETWORK_ERROR', 'PERMISSION_DENIED', 'DISK_FULL', 'ENCODE_FAILED', 'NATIVE_ERROR',
    ] as const;
    if ((knownCodes as readonly string[]).includes(prefix)) {
      return new ThumbifyError(prefix as (typeof knownCodes)[number], message, { uri, cause: err });
    }
  }

  // Keyword fallback
  const msg = raw.toLowerCase();
  if (msg.includes('cancelled') || msg.includes('abort')) {
    return new ThumbifyError('CANCELLED', raw, { uri, cause: err });
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return new ThumbifyError('TIMEOUT', `Timed out generating thumbnail: ${uri}`, { uri, cause: err });
  }
  if (msg.includes('network') || msg.includes('connect') || msg.includes('socket')) {
    return new ThumbifyError('NETWORK_ERROR', `Network error: ${raw}`, { uri, cause: err });
  }
  if (msg.includes('permission') || msg.includes('denied')) {
    return new ThumbifyError('PERMISSION_DENIED', `Permission denied: ${raw}`, { uri, cause: err });
  }
  if (msg.includes('decode') || msg.includes('codec') || msg.includes('format')) {
    return new ThumbifyError('DECODE_FAILED', `Cannot decode video: ${raw}`, { uri, cause: err });
  }
  if (msg.includes('space') || msg.includes('disk') || msg.includes('storage')) {
    return new ThumbifyError('DISK_FULL', `Disk full: ${raw}`, { uri, cause: err });
  }
  return new ThumbifyError('NATIVE_ERROR', raw, { uri, cause: err });
}

function getNative(): ThumbifyNativeModule {
  if (!_native) {
    throw new ThumbifyError(
      'NATIVE_ERROR',
      'react-native-thumbify: native module not linked. ' +
        'Ensure expo-modules-core is installed and run `pod install` (iOS) or rebuild (Android). ' +
        'Expo managed projects: run `expo prebuild` after installing the package.',
    );
  }
  return _native;
}

export async function nativeGenerate(
  opts: ThumbnailOptions,
  cacheDir: string,
  cacheFilename: string,
): Promise<NativeResult> {
  try {
    return await getNative().generate({
      uri: opts.uri,
      timeMs: opts.timeMs ?? 0,
      format: opts.format ?? 'jpeg',
      quality: opts.quality ?? 80,
      maxWidth: opts.maxWidth ?? 0,
      maxHeight: opts.maxHeight ?? 0,
      headers: opts.headers ?? {},
      timeoutMs: opts.timeoutMs ?? 15000,
      cacheDir,
      cacheFilename,
    });
  } catch (err: unknown) {
    if (err instanceof ThumbifyError) throw err;
    throw mapNativeError(err, opts.uri);
  }
}

export async function nativeClearCache(directory: string): Promise<void> {
  return getNative().clearCache(directory);
}

export async function nativeGetCacheSize(directory: string): Promise<number> {
  return getNative().getCacheSize(directory);
}
