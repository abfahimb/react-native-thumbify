/**
 * Expo managed workflow entry point.
 *
 * Import this instead of the root package when using Expo managed workflow:
 *
 *   import { generateThumbnail } from 'react-native-thumbify/expo';
 *
 * Requires `expo-video-thumbnails` to be installed as a peer dependency.
 * Native module is never used — all generation goes through expo-video-thumbnails.
 */
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

export {
  configure,
  generateThumbnail,
  generateBatch,
  generateTimeline,
  clearMemoryCache,
  clearDiskCache,
} from './index';
