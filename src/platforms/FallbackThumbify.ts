/**
 * JavaScript fallback for Expo managed workflow.
 * Uses expo-video-thumbnails under the hood when available,
 * otherwise throws a clear error with migration instructions.
 */
import { ThumbifyError } from '../types';
import type { ThumbnailOptions } from '../types';

interface ExpoVideoThumbnails {
  getThumbnailAsync(
    sourceFilename: string,
    options?: { time?: number; quality?: number }
  ): Promise<{ uri: string; width: number; height: number }>;
}

interface FallbackResult {
  path: string;
  width: number;
  height: number;
  size: number;
}

function getExpoModule(): ExpoVideoThumbnails | null {
  try {
    // Dynamic require so bundler doesn't fail if package absent
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-video-thumbnails') as ExpoVideoThumbnails;
  } catch {
    return null;
  }
}

export async function fallbackGenerate(opts: ThumbnailOptions): Promise<FallbackResult> {
  if (opts.signal?.aborted) {
    throw new ThumbifyError('CANCELLED', 'Cancelled before fallback generation');
  }

  const expo = getExpoModule();
  if (!expo) {
    throw new ThumbifyError(
      'NATIVE_ERROR',
      'react-native-thumbify: native module not linked and expo-video-thumbnails not installed. ' +
        'Options:\n' +
        '  1. Bare RN: run `pod install` + rebuild\n' +
        '  2. Expo managed: install expo-video-thumbnails as peer dep',
    );
  }

  try {
    const result = await expo.getThumbnailAsync(opts.uri, {
      time: opts.timeMs ?? 0,
      quality: (opts.quality ?? 80) / 100,
    });

    return {
      path: result.uri,
      width: result.width,
      height: result.height,
      size: 0, // expo doesn't report size
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ThumbifyError('NATIVE_ERROR', `expo-video-thumbnails failed: ${msg}`, {
      uri: opts.uri,
      cause: err,
    });
  }
}
