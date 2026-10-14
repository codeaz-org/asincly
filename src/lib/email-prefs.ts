import { createHmac, timingSafeEqual } from "node:crypto";
import type { notifications } from "@/db/schema";

// Two email streams a person can turn off: daily check-in reminders, and
// activity (mentions, replies, help offered, nudges).
export type EmailKind = "reminders" | "activity";

type NotificationType = (typeof notifications.$inferInsert)["type"];

export const emailKindFor = (type: NotificationType): EmailKind => (type === "window_open" ? "reminders" : "activity");

export const EMAIL_KIND_LABEL: Record<EmailKind, string> = {
  reminders: "check-in reminders",
  activity: "activity emails (mentions, replies, help, nudges)",
};

// Unsubscribe links work without signing in (that's the point), so they're
// signed: a link turns off one stream for one person, and nothing else.
function sign(userId: string, kind: EmailKind): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`unsubscribe:${userId}:${kind}`).digest("base64url");
}

export function unsubscribeUrl(userId: string, kind: EmailKind): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const q = new URLSearchParams({ u: userId, k: kind, s: sign(userId, kind) });
  return `${base}/unsubscribe?${q}`;
}

export function verifyUnsubscribe(userId: string, kind: string, sig: string): kind is EmailKind {
  if (kind !== "reminders" && kind !== "activity") return false;
  const want = Buffer.from(sign(userId, kind));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
