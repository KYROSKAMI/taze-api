/**
 * TAZE API — High Performance In-Memory Cache Store
 * Provides TTL eviction, namespaces, hit/miss telemetry, and LRU safety.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  hits: number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRatio: number;
  evictions: number;
}

export class CacheService {
  private store: Map<string, CacheEntry<unknown>> = new Map();
  private maxSize: number;
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  // Standard TTL defaults (in milliseconds)
  public static readonly TTL = {
    METADATA: 24 * 60 * 60 * 1000,    // 24 hours
    ID_MAPPING: 48 * 60 * 60 * 1000,  // 48 hours
    EPISODES: 60 * 60 * 1000,         // 1 hour
    SCHEDULE: 30 * 60 * 1000,         // 30 minutes
    PLAYBACK: 15 * 60 * 1000,         // 15 minutes
    PROVIDERS: 10 * 60 * 1000,        // 10 minutes
  };

  constructor(maxSize: number = 5000) {
    this.maxSize = maxSize;

    // Background cleanup job every 2 minutes
    setInterval(() => {
      this.purgeExpired();
    }, 120_000).unref();
  }

  public get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    entry.hits++;
    this.hits++;
    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlMs: number = CacheService.TTL.METADATA): void {
    const now = Date.now();

    // Prevent runaway memory usage
    if (this.store.size >= this.maxSize) {
      this.evictOldest();
    }

    this.store.set(key, {
      value,
      createdAt: now,
      expiresAt: now + ttlMs,
      hits: 0,
    });
  }

  public has(key: string): boolean {
    return this.get(key) !== null;
  }

  public delete(key: string): boolean {
    return this.store.delete(key);
  }

  public deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  public clear(): void {
    this.store.clear();
  }

  public getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRatio: totalRequests > 0 ? parseFloat((this.hits / totalRequests).toFixed(4)) : 0,
      evictions: this.evictions,
    };
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
      this.evictions++;
    }
  }
}

export const globalCache = new CacheService();
