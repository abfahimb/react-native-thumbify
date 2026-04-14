import { NativeModules } from 'react-native';
import { ThumbifyError } from '../types';
import type { ThumbnailOptions } from '../types';

interface NativeResult {
  path: string;
  width: number;
  height: number;
  size: number;
}

interface NativeThumbifyModule {
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

const LINKING_ERROR =
  'react-native-thumbify native module not linked. ' +
  'Run `pod install` (iOS) or rebuild (Android). ' +
  'For Expo managed projects use the Expo fallback: import from "react-native-thumbify/expo"';

function getNativeModule(): NativeThumbifyModule {
  const mod = NativeModules.RNThumbify as NativeThumbifyModule | undefined;
  if (!mod) {
    throw new ThumbifyError('NATIVE_ERROR', LINKING_ERROR);
  }
  return mod;
}

export function isNativeAvailable(): boolean {
  return !!NativeModules.RNThumbify;
}

export async function nativeGenerate(
  opts: ThumbnailOptions,
  cacheDir: string,
  cacheFilename: string,
): Promise<NativeResult> {
  const mod = getNativeModule();

  try {
    return await mod.generate({
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
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes('cancelled') || msg.includes('abort')) {
      throw new ThumbifyError('CANCELLED', 'Native generation cancelled', { uri: opts.uri, cause: err });
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      throw new ThumbifyError('TIMEOUT', `Timed out generating thumbnail: ${opts.uri}`, { uri: opts.uri, cause: err });
    }
    if (msg.includes('network') || msg.includes('connect') || msg.includes('socket')) {
      throw new ThumbifyError('NETWORK_ERROR', `Network error: ${msg}`, { uri: opts.uri, cause: err });
    }
    if (msg.includes('permission') || msg.includes('denied')) {
      throw new ThumbifyError('PERMISSION_DENIED', `Permission denied: ${msg}`, { uri: opts.uri, cause: err });
    }
    if (msg.includes('decode') || msg.includes('codec') || msg.includes('format')) {
      throw new ThumbifyError('DECODE_FAILED', `Cannot decode video: ${msg}`, { uri: opts.uri, cause: err });
    }
    if (msg.includes('space') || msg.includes('disk') || msg.includes('storage')) {
      throw new ThumbifyError('DISK_FULL', `Disk full: ${msg}`, { uri: opts.uri, cause: err });
    }

    throw new ThumbifyError('NATIVE_ERROR', msg, { uri: opts.uri, cause: err });
  }
}

export async function nativeClearCache(directory: string): Promise<void> {
  const mod = getNativeModule();
  return mod.clearCache(directory);
}

export async function nativeGetCacheSize(directory: string): Promise<number> {
  const mod = getNativeModule();
  return mod.getCacheSize(directory);
}
