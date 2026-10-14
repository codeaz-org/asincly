import { createHash, timingSafeEqual } from "node:crypto";

// Scheduler auth for /api/cron/*: `Authorization: Bearer $CRON_SECRET` only.
// No ?secret= form — query strings land in CDN and proxy access logs. Hashing
// both sides gives equal-length buffers, so the compare is constant-time
// without leaking the secret's length.
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const passed = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(passed), digest(secret));
}
