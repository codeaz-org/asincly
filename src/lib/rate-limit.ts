import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

// Fixed-window limiter in Postgres, so every instance shares one budget per
// key (a per-process map gave each serverless function its own). One upsert
// per hit; the daily cron drops windows that have ended.
// ponytail: a fixed window lets up to 2× `limit` through across a window
// boundary; move to a sliding log if that ever matters for a key.

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
};

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  const start = new Date(Math.floor(now / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: start, hits: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { hits: sql`${rateLimits.hits} + 1` },
    })
    .returning({ hits: rateLimits.hits });
  return {
    allowed: row.hits <= limit,
    remaining: Math.max(0, limit - row.hits),
    resetMs: start.getTime() + windowMs - now,
  };
}

// The longest window any caller uses is a day; anything older is dead.
export async function purgeRateLimits(now: Date): Promise<number> {
  const gone = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, new Date(now.getTime() - 2 * 24 * 3600 * 1000)))
    .returning({ key: rateLimits.key });
  return gone.length;
}
