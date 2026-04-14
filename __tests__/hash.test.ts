import { buildCacheKey, buildCacheFilename, hashString } from '../src/utils/hash';

describe('hash utils', () => {
  it('same opts → same key', () => {
    const opts = { uri: 'file:///video.mp4', timeMs: 1000, format: 'jpeg' as const, quality: 80 };
    expect(buildCacheKey(opts)).toBe(buildCacheKey(opts));
  });

  it('different timeMs → different key', () => {
    const a = { uri: 'file:///video.mp4', timeMs: 1000 };
    const b = { uri: 'file:///video.mp4', timeMs: 2000 };
    expect(buildCacheKey(a)).not.toBe(buildCacheKey(b));
  });

  it('buildCacheFilename includes format extension', () => {
    const opts = { uri: 'file:///video.mp4', format: 'webp' as const };
    expect(buildCacheFilename(opts)).toMatch(/\.webp$/);
  });

  it('hashString produces 8-char hex', () => {
    expect(hashString('hello')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('hashString deterministic', () => {
    expect(hashString('test')).toBe(hashString('test'));
  });
});
