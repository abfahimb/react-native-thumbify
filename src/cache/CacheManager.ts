import { Platform } from 'react-native';
import type { CacheConfig } from '../types';

interface CacheEntry {
  path: string;
  width: number;
  height: number;
  size: number;
  createdAt: number;
  lastAccessed: number;
  diskSize: number;
}

const DEFAULT_CONFIG: Required<CacheConfig> = {
  maxEntries: 200,
  ttl: 30 * 60 * 1000,       // 30 min
  maxDiskSize: 100 * 1024 * 1024, // 100MB
  directory: '',              // resolved at runtime
};

export class CacheManager {
  private lru = new Map<string, CacheEntry>(); // insertion order = LRU
  private totalDiskSize = 0;
  private cfg: Required<CacheConfig>;

  constructor(config: CacheConfig = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    if (!this.cfg.directory) {
      this.cfg.directory = this.resolveDefaultDir();
    }
  }

  private resolveDefaultDir(): string {
    // Resolved by native side — JS side uses this as fallback hint
    return Platform.OS === 'ios'
      ? `${process.env.TMPDIR ?? '/tmp'}/thumbify`
      : '/data/local/tmp/thumbify';
  }

  get directory(): string {
    return this.cfg.directory;
  }

  get(key: string): CacheEntry | null {
    const entry = this.lru.get(key);
    if (!entry) return null;

    // TTL check
    if (Date.now() - entry.createdAt > this.cfg.ttl) {
      this.evict(key);
      return null;
    }

    // Refresh LRU position
    entry.lastAccessed = Date.now();
    this.lru.delete(key);
    this.lru.set(key, entry);
    return entry;
  }

  set(key: string, entry: Omit<CacheEntry, 'createdAt' | 'lastAccessed'>): void {
    // Remove old entry if exists
    if (this.lru.has(key)) {
      const old = this.lru.get(key)!;
      this.totalDiskSize -= old.diskSize;
      this.lru.delete(key);
    }

    const full: CacheEntry = { ...entry, createdAt: Date.now(), lastAccessed: Date.now() };
    this.lru.set(key, full);
    this.totalDiskSize += full.diskSize;

    this.enforceLimit();
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  private evict(key: string): void {
    const entry = this.lru.get(key);
    if (entry) {
      this.totalDiskSize -= entry.diskSize;
      this.lru.delete(key);
    }
  }

  private enforceLimit(): void {
    // Evict oldest until under limits (LRU — first entry = oldest)
    while (
      this.lru.size > this.cfg.maxEntries ||
      this.totalDiskSize > this.cfg.maxDiskSize
    ) {
      const oldestKey = this.lru.keys().next().value;
      if (!oldestKey) break;
      this.evict(oldestKey);
    }
  }

  /** Remove all expired entries */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.lru) {
      if (now - entry.createdAt > this.cfg.ttl) {
        this.evict(key);
        pruned++;
      }
    }
    return pruned;
  }

  clear(): void {
    this.lru.clear();
    this.totalDiskSize = 0;
  }

  stats() {
    return {
      entries: this.lru.size,
      totalDiskSize: this.totalDiskSize,
      maxEntries: this.cfg.maxEntries,
      maxDiskSize: this.cfg.maxDiskSize,
    };
  }
}
