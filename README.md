# react-native-thumbify

The modern React Native thumbnail generator. Batch processing, smart caching, WebP support, cancellation, and TypeScript-first — everything the existing solutions are missing.

[![npm version](https://img.shields.io/npm/v/react-native-thumbify.svg)](https://www.npmjs.com/package/react-native-thumbify)
[![npm downloads](https://img.shields.io/npm/dm/react-native-thumbify.svg)](https://www.npmjs.com/package/react-native-thumbify)
[![license](https://img.shields.io/npm/l/react-native-thumbify.svg)](LICENSE)
[![platform ios](https://img.shields.io/badge/platform-iOS-lightgrey.svg)](https://reactnative.dev)
[![platform android](https://img.shields.io/badge/platform-Android-green.svg)](https://reactnative.dev)

---

## Why not the others?

| | react-native-create-thumbnail | expo-video-thumbnails | **react-native-thumbify** |
|---|:---:|:---:|:---:|
| TypeScript | Partial | Partial | Full strict types |
| Batch processing | No | No | Yes — configurable concurrency |
| Cancellation (AbortSignal) | No | No | Yes |
| Request deduplication | No | No | Yes |
| WebP output | No | No | Yes |
| Timeline / scrubbing frames | No | No | Yes |
| Retry + exponential backoff | No | No | Yes |
| Auth headers (Bearer tokens) | Basic | No | Yes |
| LRU cache with TTL | Basic | No | Yes |
| Expo managed fallback | No | Yes | Yes |
| Typed error codes | No | No | Yes |
| Last updated | 2024 | 2024 | 2026 |

---

## How it works

Unlike players that buffer and screenshot a rendered view, `react-native-thumbify` talks **directly to the OS video decoder** — no player, no buffer, no UI thread blocking.

- **iOS** — `AVAssetImageGenerator` seeks to the nearest I-frame and decodes only that frame using the hardware H.264/H.265 decoder
- **Android** — `MediaMetadataRetriever.getScaledFrameAtTime` with `OPTION_CLOSEST_SYNC` for maximum speed
- **Result** — ~50ms per frame vs ~500ms for player-based approaches, works fully headless

---

## Installation

```sh
npm install react-native-thumbify
```

### iOS

```sh
cd ios && pod install
```

### Android

No extra steps. Auto-linked via React Native's standard autolinking.

### Expo managed workflow

No native linking needed. Install the peer fallback:

```sh
npx expo install expo-video-thumbnails
```

`react-native-thumbify` auto-detects the environment and uses `expo-video-thumbnails` when the native module isn't linked.

---

## Quick start

```ts
import { generateThumbnail } from 'react-native-thumbify';

const thumb = await generateThumbnail({
  uri: 'file:///path/to/video.mp4',
  timeMs: 3000,
});

console.log(thumb.path);    // /tmp/thumbify/thumbify_a3f1b2c4.jpeg
console.log(thumb.width);   // 1280
console.log(thumb.height);  // 720
console.log(thumb.fromCache); // false (true on second call)
```

---

## API

### Configure (call once at app startup)

```ts
import { configure } from 'react-native-thumbify';

configure({
  defaultFormat: 'webp',
  defaultQuality: 85,
  defaultTimeoutMs: 20_000,
  cache: {
    maxEntries: 300,
    ttl: 60 * 60 * 1000,      // 1 hour
    maxDiskSize: 200 * 1024 * 1024, // 200MB
  },
  retry: {
    maxAttempts: 3,
    initialDelay: 500,
  },
  debug: __DEV__,
});
```

---

### `generateThumbnail(options)`

Generate a single thumbnail.

```ts
const result = await generateThumbnail({
  uri: 'https://example.com/video.mp4',
  timeMs: 5000,           // timestamp in ms — default: 0
  format: 'webp',         // 'jpeg' | 'png' | 'webp' — default: 'jpeg'
  quality: 85,            // 0–100 — default: 80
  maxWidth: 640,          // preserves aspect ratio
  maxHeight: 360,
  headers: {
    Authorization: 'Bearer your-token',
  },
  timeoutMs: 15_000,
  forceRefresh: false,    // skip cache and regenerate
  signal: abortController.signal,
});
```

**Returns:**

```ts
{
  path: string;       // absolute path to thumbnail file
  width: number;      // actual output width in px
  height: number;     // actual output height in px
  size: number;       // file size in bytes
  fromCache: boolean; // true if served from LRU cache
  durationMs: number; // time taken (0 if from cache)
}
```

---

### `generateBatch(items, options)`

Generate multiple thumbnails with controlled concurrency.

```ts
const results = await generateBatch(
  [
    { id: 'v1', uri: 'file:///video1.mp4', timeMs: 0 },
    { id: 'v2', uri: 'file:///video2.mp4', timeMs: 1000 },
    { id: 'v3', uri: 'https://remote.example/video3.mp4', timeMs: 5000 },
  ],
  {
    concurrency: 3,
    onItemComplete: (result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`[${index}] ${result.value.path}`);
      } else {
        console.error(`[${index}] ${result.reason.code}: ${result.reason.message}`);
      }
    },
    signal: abortController.signal, // cancels entire batch
  }
);

// results is BatchResult[] — each item is fulfilled | rejected
const succeeded = results.filter((r) => r.status === 'fulfilled');
const failed    = results.filter((r) => r.status === 'rejected');
```

Single item failure **does not** cancel the rest of the batch.

---

### `generateTimeline(options)`

Extract evenly-spaced frames — perfect for video scrubbing previews.

```ts
const frames = await generateTimeline({
  uri: 'file:///movie.mp4',
  frameCount: 20,       // number of frames
  startMs: 0,
  endMs: 120_000,       // 2 minutes
  maxWidth: 160,        // small thumbnails for scrub bar
  format: 'jpeg',
  quality: 60,
  concurrency: 4,
  onFrameReady: (frame, index) => {
    // called as each frame completes — update UI progressively
    setScrubFrames((prev) => [...prev, frame]);
  },
});

// or use explicit timestamps
const frames = await generateTimeline({
  uri: 'file:///movie.mp4',
  timestamps: [0, 15_000, 30_000, 60_000, 90_000],
});
```

---

### Cancellation

Every API accepts an `AbortSignal`. Cancelled requests throw `ThumbifyError` with `code: 'CANCELLED'`.

```ts
const controller = new AbortController();

// Cancel after 3 seconds
setTimeout(() => controller.abort(), 3000);

try {
  const thumb = await generateThumbnail({
    uri: 'https://slow-cdn.example/video.mp4',
    signal: controller.signal,
  });
} catch (err) {
  if (err instanceof ThumbifyError && err.code === 'CANCELLED') {
    console.log('User navigated away — generation cancelled');
  }
}
```

---

### Error handling

All errors are `ThumbifyError` with a typed `code`:

```ts
import { generateThumbnail, ThumbifyError } from 'react-native-thumbify';

try {
  const thumb = await generateThumbnail({ uri });
} catch (err) {
  if (err instanceof ThumbifyError) {
    switch (err.code) {
      case 'INVALID_URI':       // empty or malformed URI
      case 'NETWORK_ERROR':     // connection failed (auto-retried)
      case 'TIMEOUT':           // exceeded timeoutMs (auto-retried)
      case 'CANCELLED':         // AbortSignal fired
      case 'DECODE_FAILED':     // video format unsupported / corrupt
      case 'ENCODE_FAILED':     // JPEG/PNG/WebP encoding error
      case 'PERMISSION_DENIED': // storage permission missing
      case 'DISK_FULL':         // no space to write thumbnail
      case 'NATIVE_ERROR':      // platform-level error
      case 'UNKNOWN':
    }
    console.error(err.code, err.message, err.uri);
  }
}
```

---

### Cache management

```ts
import { clearMemoryCache, clearDiskCache } from 'react-native-thumbify';
import { ThumbnailGenerator } from 'react-native-thumbify';

// Default singleton
clearMemoryCache(); // clear in-memory LRU (instant)
await clearDiskCache(); // delete all thumbify_ files from disk

// Or per-instance
const generator = new ThumbnailGenerator({ cache: { maxEntries: 50 } });
console.log(generator.cacheStats());
// { entries: 12, totalDiskSize: 458752, maxEntries: 50, maxDiskSize: 104857600 }

generator.pruneExpired(); // remove TTL-expired entries
await generator.clearDiskCache();
```

---

### Instance API

For advanced use cases — multiple generators with different configs:

```ts
import { ThumbnailGenerator } from 'react-native-thumbify';

// High quality generator for detail views
const hdGenerator = new ThumbnailGenerator({
  defaultFormat: 'webp',
  defaultQuality: 95,
  cache: { maxEntries: 50, ttl: 5 * 60 * 1000 },
});

// Low quality generator for list thumbnails
const listGenerator = new ThumbnailGenerator({
  defaultFormat: 'jpeg',
  defaultQuality: 60,
  cache: { maxEntries: 500, maxDiskSize: 50 * 1024 * 1024 },
});

const hd   = await hdGenerator.generate({ uri, maxWidth: 1280 });
const tiny = await listGenerator.generate({ uri, maxWidth: 120 });
```

---

## Options reference

### `ThumbnailOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `uri` | `string` | required | Local file path or remote URL |
| `timeMs` | `number` | `0` | Timestamp in milliseconds |
| `format` | `'jpeg' \| 'png' \| 'webp'` | `'jpeg'` | Output image format |
| `quality` | `number` | `80` | Compression quality 0–100 |
| `maxWidth` | `number` | — | Max output width (aspect ratio preserved) |
| `maxHeight` | `number` | — | Max output height (aspect ratio preserved) |
| `headers` | `Record<string, string>` | — | HTTP headers (auth, cookies, etc.) |
| `timeoutMs` | `number` | `15000` | Network timeout in ms |
| `retry` | `RetryConfig \| false` | from config | Retry behaviour. Pass `false` to disable |
| `forceRefresh` | `boolean` | `false` | Skip cache, always regenerate |
| `signal` | `AbortSignal` | — | Cancellation signal |

### `CacheConfig`

| Option | Type | Default | Description |
|---|---|---|---|
| `maxEntries` | `number` | `200` | Max cached thumbnails |
| `ttl` | `number` | `1800000` | Time-to-live in ms (30 min) |
| `maxDiskSize` | `number` | `104857600` | Max total disk usage in bytes (100MB) |
| `directory` | `string` | system temp | Custom cache directory |

### `RetryConfig`

| Option | Type | Default | Description |
|---|---|---|---|
| `maxAttempts` | `number` | `3` | Max retry attempts |
| `initialDelay` | `number` | `300` | First retry delay in ms |
| `multiplier` | `number` | `2` | Backoff multiplier |
| `maxDelay` | `number` | `5000` | Max delay between retries |

---

## Platform notes

### WebP support

- **iOS** — WebP encoding via `ImageIO` framework. Requires **iOS 14+**. Falls back to JPEG on older versions automatically.
- **Android** — `Bitmap.CompressFormat.WEBP_LOSSY` on **API 30+**, `WEBP` (deprecated but functional) on API 21–29.

### Remote videos

Both platforms use HTTP range requests — only the container index and the target GOP are fetched, not the entire file. This means a thumbnail from a 2GB remote video downloads only a few KB of data.

### Permissions

- **iOS** — No permissions required for local files or remote URLs.
- **Android** — No storage permissions required for files in app-private directories or remote URLs. `READ_EXTERNAL_STORAGE` required only for files in shared external storage (rare).

### Minimum versions

| Platform | Minimum |
|---|---|
| iOS | 13.0 |
| Android | API 21 (Android 5.0) |
| React Native | 0.68.0 |

---

## Common patterns

### FlatList with thumbnails

```tsx
import { generateThumbnail } from 'react-native-thumbify';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';

function VideoThumb({ uri }: { uri: string }) {
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    generateThumbnail({ uri, timeMs: 0, maxWidth: 200, signal: controller.signal })
      .then((r) => setPath(r.path))
      .catch(() => {}); // CANCELLED on unmount — ignore

    return () => controller.abort();
  }, [uri]);

  return path ? <Image source={{ uri: `file://${path}` }} /> : null;
}
```

### Video scrub bar

```tsx
import { generateTimeline } from 'react-native-thumbify';

const [frames, setFrames] = useState<string[]>([]);

await generateTimeline({
  uri: videoUri,
  frameCount: 30,
  endMs: durationMs,
  maxWidth: 80,
  format: 'jpeg',
  quality: 50,
  concurrency: 6,
  onFrameReady: (frame) => {
    setFrames((prev) => [...prev, frame.path]);
  },
});
```

### Pre-warm cache before navigation

```ts
// Pre-generate thumbnails while user is on the list screen
await generateBatch(
  videos.map((v) => ({ uri: v.url, timeMs: 0, maxWidth: 300 })),
  { concurrency: 4 }
);
// By the time user taps into detail view, thumbnail is already cached
```

---

## Contributing

Pull requests welcome. Please open an issue first for large changes.

```sh
git clone https://github.com/abfahimb/react-native-thumbify
cd react-native-thumbify
npm install
npm test
```

---

## License

MIT License

Copyright (c) 2026 Abdullah Al Fahim

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.