import { like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { rateLimit } from "./rate-limit";

// Requires local Postgres up (pnpm db:up) with migrations applied.

const prefix = `test-${Math.random().toString(36).slice(2, 8)}`;

afterAll(async () => {
  await db.delete(rateLimits).where(like(rateLimits.key, `${prefix}%`));
});

describe("rateLimit", () => {
  it("counts every caller against one budget, as separate instances would", async () => {
    const key = `${prefix}:shared`;
    // Concurrent hits stand in for several serverless instances.
    const results = await Promise.all(Array.from({ length: 5 }, () => rateLimit(key, 3, 60_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect((await rateLimit(key, 3, 60_000)).allowed).toBe(false);
  });

  it("keeps keys independent", async () => {
    expect((await rateLimit(`${prefix}:a`, 1, 60_000)).allowed).toBe(true);
    expect((await rateLimit(`${prefix}:b`, 1, 60_000)).allowed).toBe(true);
    expect((await rateLimit(`${prefix}:a`, 1, 60_000)).allowed).toBe(false);
  });
});
