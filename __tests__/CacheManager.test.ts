import { CacheManager } from '../src/cache/CacheManager';

const makeEntry = (overrides = {}) => ({
  path: '/tmp/thumb.jpg',
  width: 320,
  height: 180,
  size: 4096,
  diskSize: 4096,
  ...overrides,
});

describe('CacheManager', () => {
  it('set and get returns entry', () => {
    const cache = new CacheManager();
    cache.set('key1', makeEntry());
    expect(cache.get('key1')).not.toBeNull();
  });

  it('miss on unknown key', () => {
    const cache = new CacheManager();
    expect(cache.get('missing')).toBeNull();
  });

  it('evicts oldest when maxEntries exceeded', () => {
    const cache = new CacheManager({ maxEntries: 2 });
    cache.set('a', makeEntry());
    cache.set('b', makeEntry());
    cache.set('c', makeEntry()); // should evict 'a'
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).not.toBeNull();
    expect(cache.get('c')).not.toBeNull();
  });

  it('TTL expiry removes entry', () => {
    const cache = new CacheManager({ ttl: 1 }); // 1ms TTL
    cache.set('key', makeEntry());
    return new Promise((r) => setTimeout(r, 10)).then(() => {
      expect(cache.get('key')).toBeNull();
    });
  });

  it('clear empties cache', () => {
    const cache = new CacheManager();
    cache.set('a', makeEntry());
    cache.set('b', makeEntry());
    cache.clear();
    expect(cache.stats().entries).toBe(0);
  });

  it('stats reflect current state', () => {
    const cache = new CacheManager({ maxEntries: 10 });
    cache.set('x', makeEntry({ diskSize: 1000 }));
    const s = cache.stats();
    expect(s.entries).toBe(1);
    expect(s.totalDiskSize).toBe(1000);
  });
});
