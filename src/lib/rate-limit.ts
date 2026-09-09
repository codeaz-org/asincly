// In-memory sliding-window rate limiter. Per-process — good enough for a
// single Vercel region or single container. Swap to Redis (Upstash) when
// scaling out. Fires from server actions and route handlers.

type Bucket = { hits: number[]; };
const buckets = new Map<string, Bucket>();

// Housekeeping: cap the map so a burst of unique keys doesn't leak memory.
const MAX_KEYS = 50_000;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  if (buckets.size > MAX_KEYS) {
    // Evict any key older than the window.
    for (const [k, b] of buckets) {
      const last = b.hits[b.hits.length - 1] ?? 0;
      if (last < cutoff) buckets.delete(k);
      if (buckets.size <= MAX_KEYS / 2) break;
    }
  }

  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => t >= cutoff);
  const allowed = b.hits.length < limit;
  if (allowed) b.hits.push(now);
  buckets.set(key, b);

  const remaining = Math.max(0, limit - b.hits.length);
  const oldest = b.hits[0] ?? now;
  const resetMs = oldest + windowMs - now;
  return { allowed, remaining, resetMs };
}
