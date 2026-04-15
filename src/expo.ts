/**
 * Expo entry point — kept for backward compatibility.
 * Functionally identical to the default entry point since the package
 * now uses expo-modules-core natively in both managed and bare workflows.
 *
 * Both of these are equivalent:
 *   import { generateThumbnail } from 'react-native-thumbify';
 *   import { generateThumbnail } from 'react-native-thumbify/expo';
 */
export {
  ThumbnailGenerator,
  ThumbifyError,
  configure,
  generateThumbnail,
  generateBatch,
  generateTimeline,
  clearMemoryCache,
  clearDiskCache,
} from './index';

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
