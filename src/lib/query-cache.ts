// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  In-Memory Query Cache (LRU with TTL)
//  Repeated queries get instant responses replayed with typing effect.
//  For multi-instance production: replace with Redis.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CacheEntry {
  content: string;
  timestamp: number;
}

class QueryCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 100;
  private ttlMs = 300_000; // 5 minutes

  constructor() {
    // Auto-cleanup every 5 minutes
    if (typeof setInterval === 'function') {
      setInterval(() => this.cleanup(), 300_000);
    }
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.content;
  }

  set(key: string, content: string): void {
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    this.cache.set(key, { content, timestamp: Date.now() });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }
}

// ── Simple hash for cache keys ──

function simpleHash(str: string): string {
  let hash = 0;
  const s = str.toLowerCase().trim();
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return String(Math.abs(hash));
}

// ── Singleton ──
export const queryCache = new QueryCache();
export { simpleHash };
