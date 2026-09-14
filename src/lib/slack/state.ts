import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// OAuth `state` for the Slack install: which team, who started it, until when.
// HMAC-signed with AUTH_SECRET so the callback can trust it without storage.

const StateSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().min(1).max(200),
  exp: z.number().int(),
});
export type InstallState = z.infer<typeof StateSchema>;

const TTL_MS = 10 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`slack-install:${payload}`).digest("base64url");
}

export function createState(teamId: string, userId: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ teamId, userId, exp: now + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readState(state: string, secret: string, now = Date.now()): InstallState | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = StateSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.exp < now) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
