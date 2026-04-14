/**
 * react-native-thumbify — usage examples
 */
import {
  configure,
  generateThumbnail,
  generateBatch,
  generateTimeline,
  ThumbnailGenerator,
  ThumbifyError,
} from 'react-native-thumbify';

// ─── 1. Configure once at app startup ────────────────────────────────────────

configure({
  defaultFormat: 'webp',
  defaultQuality: 85,
  defaultTimeoutMs: 20_000,
  cache: { maxEntries: 300, ttl: 60 * 60 * 1000 }, // 1hr TTL
  retry: { maxAttempts: 3, initialDelay: 500 },
  debug: __DEV__,
});

// ─── 2. Single thumbnail ──────────────────────────────────────────────────────

async function single() {
  try {
    const thumb = await generateThumbnail({
      uri: 'https://example.com/video.mp4',
      timeMs: 3000,
      format: 'jpeg',
      quality: 80,
      maxWidth: 640,
      headers: { Authorization: 'Bearer my-token' },
    });
    console.log(thumb.path, thumb.width, thumb.height, thumb.fromCache);
  } catch (err) {
    if (err instanceof ThumbifyError) {
      console.error(err.code, err.message); // typed error code
    }
  }
}

// ─── 3. Cancellation ─────────────────────────────────────────────────────────

async function withCancellation() {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 2000);

  try {
    const thumb = await generateThumbnail({
      uri: 'https://slow-server.example/video.mp4',
      signal: controller.signal,
    });
    console.log(thumb.path);
  } catch (err) {
    if (err instanceof ThumbifyError && err.code === 'CANCELLED') {
      console.log('User cancelled');
    }
  }
}

// ─── 4. Batch processing ──────────────────────────────────────────────────────

async function batch() {
  const videos = [
    { id: 'v1', uri: 'file:///local/video1.mp4', timeMs: 0 },
    { id: 'v2', uri: 'file:///local/video2.mp4', timeMs: 1000 },
    { id: 'v3', uri: 'https://remote.example/video3.mp4', timeMs: 5000 },
  ];

  const results = await generateBatch(videos, {
    concurrency: 3,
    onItemComplete: (result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`[${index}] done: ${result.value.path}`);
      } else {
        console.error(`[${index}] failed: ${result.reason.code}`);
      }
    },
  });

  const thumbs = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.status === 'fulfilled' ? r.value : null);

  console.log(`${thumbs.length}/${results.length} succeeded`);
}

// ─── 5. Timeline / scrubbing frames ──────────────────────────────────────────

async function timeline() {
  const frames = await generateTimeline({
    uri: 'file:///local/movie.mp4',
    frameCount: 20,
    startMs: 0,
    endMs: 120_000, // 2 minutes
    maxWidth: 160,
    format: 'jpeg',
    quality: 60,
    concurrency: 4,
    onFrameReady: (frame, index) => {
      console.log(`Frame ${index} ready: ${frame.path}`);
    },
  });

  console.log(`${frames.length} frames extracted`);
}

// ─── 6. Instance API (multiple configs) ──────────────────────────────────────

const thumbnailGenerator = new ThumbnailGenerator({
  defaultFormat: 'png',
  cache: false, // no cache for this instance
});

async function instanceUsage() {
  const result = await thumbnailGenerator.generate({
    uri: 'file:///video.mp4',
    forceRefresh: true,
  });
  console.log(thumbnailGenerator.cacheStats()); // null — cache disabled
}
