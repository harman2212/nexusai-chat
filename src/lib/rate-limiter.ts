// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Per-IP / Per-User Sliding-Window Rate Limiter
//  In-memory — works per server instance.
//  For multi-instance production: replace store with Redis / Upstash.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

const LIMITS = {
  guest: { maxRequests: 20, windowMs: 60_000 }, // 20 req/min for guests
  auth: { maxRequests: 40, windowMs: 60_000 }, // 40 req/min for auth users
};

// Cleanup stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL_MS = 300_000;
if (typeof globalThis !== 'undefined' && typeof setInterval === 'function') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < 60_000);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch-ms when the oldest request in window expires
}

/**
 * Check (and record) a request against the rate limit for the given identifier.
 * Call this ONCE per incoming request — it both checks and records.
 */
export function checkRateLimit(
  identifier: string,
  isAuthenticated: boolean
): RateLimitResult {
  const now = Date.now();
  const limit = isAuthenticated ? LIMITS.auth : LIMITS.guest;

  let entry = store.get(identifier);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(identifier, entry);
  }

  // Evict timestamps outside the sliding window
  entry.timestamps = entry.timestamps.filter((t) => now - t < limit.windowMs);

  if (entry.timestamps.length >= limit.maxRequests) {
    // Rate limited — compute when the oldest request in window expires
    const oldest = entry.timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldest + limit.windowMs,
    };
  }

  // Record this request
  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit.maxRequests - entry.timestamps.length,
    resetAt: now + limit.windowMs,
  };
}
