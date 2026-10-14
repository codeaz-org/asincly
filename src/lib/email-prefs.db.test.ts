import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { notifications, organizations, teams, users } from "@/db/schema";
import { POST as unsubscribe } from "@/app/api/email/unsubscribe/route";
import { notify } from "@/lib/notifications";
import { unsubscribeUrl } from "@/lib/email-prefs";

// Requires local Postgres up (pnpm db:up) with migrations applied.

const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
let userId: string;
let teamId: string;
let orgId: string;
const env = { ...process.env };

beforeAll(async () => {
  process.env.AUTH_SECRET = "test-secret";
  delete process.env.RESEND_API_KEY;
  const [u] = await db.insert(users).values({ email: `${uniq("mail")}@t.local` }).returning();
  userId = u.id;
  const [org] = await db.insert(organizations).values({ name: "Mail", slug: uniq("mail") }).returning();
  orgId = org.id;
  const [t] = await db.insert(teams).values({ orgId, name: "Mail", slug: "mail" }).returning();
  teamId = t.id;
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(users).where(eq(users.id, userId));
  process.env = env;
});

const lastEmailed = async (title: string) =>
  (await db.select().from(notifications).where(eq(notifications.title, title)))[0]?.emailSentAt ?? null;

const post = (url: string) => {
  const api = url.replace("/unsubscribe?", "/api/email/unsubscribe?");
  return unsubscribe(
    new Request(api, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    }),
  );
};

describe("email preferences", () => {
  it("one-click unsubscribe turns off that stream only, and only with a valid link", async () => {
    const bad = await post(unsubscribeUrl(userId, "activity").replace(/s=[^&]+/, "s=forged"));
    expect(bad.status).toBe(400);

    expect((await post(unsubscribeUrl(userId, "activity"))).status).toBe(200);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u.emailActivity).toBe(false);
    expect(u.emailReminders).toBe(true);
  });

  it("notify keeps the in-app notification but skips the email for a stream that's off", async () => {
    await notify({ userId, teamId, type: "mentioned", title: "m-off" });
    await notify({ userId, teamId, type: "window_open", title: "w-on" });
    const [mention] = await db.select().from(notifications).where(eq(notifications.title, "m-off"));
    expect(mention).toBeDefined();
    expect(await lastEmailed("m-off")).toBeNull();
    expect(await lastEmailed("w-on")).not.toBeNull();
  });
});
