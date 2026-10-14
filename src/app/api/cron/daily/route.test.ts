import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "./route";
import { db } from "@/db";
import {
  checkIns,
  members,
  notifications,
  occurrences,
  organizations,
  recordings,
  schedules,
  teams,
  users,
} from "@/db/schema";
import { sweepOrphanObjects } from "@/lib/recording-objects";
import { listObjects, presignedPutUrl } from "@/lib/s3";

// Requires local Postgres + MinIO up (pnpm db:up) with migrations applied.

const SECRET = "daily-test-secret";
const DAY = 24 * 3600 * 1000;
const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const env = { ...process.env };

let orgId: string;
let userId: string;
let checkInId: string;

const daily = () =>
  GET(new Request("http://localhost/api/cron/daily", { headers: { authorization: `Bearer ${SECRET}` } }));

async function put(key: string) {
  const res = await fetch(await presignedPutUrl(key, "video/webm", 1), {
    method: "PUT",
    headers: { "content-type": "video/webm" },
    body: "x",
  });
  expect(res.ok).toBe(true);
}

async function exists(key: string) {
  for await (const o of listObjects(key)) if (o.key === key) return true;
  return false;
}

const keyFor = (name: string) => `check-ins/${checkInId}/${name}.webm`;

beforeAll(async () => {
  process.env.CRON_SECRET = SECRET;
  process.env.BILLING_ENABLED = "false";
  const [user] = await db.insert(users).values({ email: `${uniq("daily")}@t.local`, tz: "UTC" }).returning();
  userId = user.id;
  const [org] = await db.insert(organizations).values({ name: "Daily", slug: uniq("daily"), ownerUserId: userId }).returning();
  orgId = org.id;
  const [team] = await db
    .insert(teams)
    .values({ orgId, name: "Daily", slug: "daily", recordingRetentionDays: 90 })
    .returning();
  await db.insert(members).values({ teamId: team.id, userId, role: "owner" });
  const [sched] = await db
    .insert(schedules)
    .values({ teamId: team.id, name: "S", rrule: "FREQ=DAILY", windowOpenLocal: "09:00", windowCloseLocal: "11:00" })
    .returning();
  const [occ] = await db.insert(occurrences).values({ scheduleId: sched.id, scheduleDate: "2026-01-05" }).returning();
  const [ci] = await db.insert(checkIns).values({ occurrenceId: occ.id, userId, localDate: "2026-01-05" }).returning();
  checkInId = ci.id;
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(users).where(eq(users.id, userId));
  process.env = env;
});

describe("daily cron", () => {
  it("rejects a request without the secret, and the old ?secret= form", async () => {
    expect((await GET(new Request("http://localhost/api/cron/daily"))).status).toBe(401);
    expect((await GET(new Request(`http://localhost/api/cron/daily?secret=${SECRET}`))).status).toBe(401);
  });

  it("deletes expired recordings from the bucket, not just the database", async () => {
    await put(keyFor("old"));
    await put(keyFor("old-audio"));
    await put(keyFor("fresh"));
    await db.insert(recordings).values([
      {
        checkInId,
        userId,
        objectKey: keyFor("old"),
        audioKey: keyFor("old-audio"),
        mimeType: "video/webm",
        createdAt: new Date(Date.now() - 100 * DAY),
      },
      { checkInId, userId, objectKey: keyFor("fresh"), mimeType: "video/webm" },
    ]);

    const res = await daily();
    expect(res.status).toBe(200);

    const left = await db.select({ key: recordings.objectKey }).from(recordings).where(eq(recordings.checkInId, checkInId));
    expect(left.map((r) => r.key)).toEqual([keyFor("fresh")]);
    expect(await exists(keyFor("old"))).toBe(false);
    expect(await exists(keyFor("old-audio"))).toBe(false);
    expect(await exists(keyFor("fresh"))).toBe(true);
  });

  it("sweeps objects no recording points at, once they're past the grace period", async () => {
    await put(keyFor("abandoned"));
    // Inside the grace period: an upload whose row may not be written yet.
    await sweepOrphanObjects(new Date());
    expect(await exists(keyFor("abandoned"))).toBe(true);

    await sweepOrphanObjects(new Date(Date.now() + 2 * DAY));
    expect(await exists(keyFor("abandoned"))).toBe(false);
    expect(await exists(keyFor("fresh"))).toBe(true);
  });

  it("drops notifications older than 90 days", async () => {
    const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.orgId, orgId));
    await db.insert(notifications).values([
      { userId, teamId: team.id, type: "nudged", title: "old", createdAt: new Date(Date.now() - 91 * DAY) },
      { userId, teamId: team.id, type: "nudged", title: "new" },
    ]);
    await daily();
    const left = await db.select({ title: notifications.title }).from(notifications).where(eq(notifications.userId, userId));
    expect(left.map((n) => n.title)).toEqual(["new"]);
  });
});
