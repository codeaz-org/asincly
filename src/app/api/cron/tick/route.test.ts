import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { db } from "@/db";
import { members, notifications, occurrences, organizations, schedules, teams, users } from "@/db/schema";
import { PRESET_RRULES } from "@/lib/time";

// Requires local Postgres up (pnpm db:up) with migrations applied.
//
// 2026-05-12 is a Tuesday and 2026-05-13 a Wednesday, so an MWF schedule
// covers the second date and not the first.

const SECRET = "tick-test-secret";
const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const env = { ...process.env };

let orgId: string;
let teamId: string;
let scheduleId: string;
let userId: string;

const tick = () =>
  GET(new Request("http://localhost/api/cron/tick", { headers: { authorization: `Bearer ${SECRET}` } }));

const occurrenceFor = (dateISO: string) =>
  db
    .select({ id: occurrences.id })
    .from(occurrences)
    .where(and(eq(occurrences.scheduleId, scheduleId), eq(occurrences.scheduleDate, dateISO)));

// window_open notifications carry the occurrence id in `data`, so match on it
// rather than counting every reminder the user ever received.
async function windowOpensFor(dateISO: string) {
  const [occ] = await occurrenceFor(dateISO);
  if (!occ) return [];
  return db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "window_open"),
        sql`${notifications.data}->>'occurrenceId' = ${occ.id}`,
      ),
    );
}

beforeAll(async () => {
  process.env.CRON_SECRET = SECRET;

  const [org] = await db.insert(organizations).values({ name: "Tick", slug: uniq("tick") }).returning();
  orgId = org.id;
  const [team] = await db.insert(teams).values({ orgId, name: "Tick", slug: "tick" }).returning();
  teamId = team.id;
  // UTC member so the local date equals the faked UTC date.
  const [user] = await db.insert(users).values({ email: `${uniq("tick")}@t.local`, name: "Tick", tz: "UTC" }).returning();
  userId = user.id;
  await db.insert(members).values({ teamId, userId, role: "owner" });
  const [schedule] = await db
    .insert(schedules)
    .values({
      teamId,
      name: "Standup",
      rrule: PRESET_RRULES.mwf,
      windowOpenLocal: "08:00",
      windowCloseLocal: "18:00",
      active: true,
    })
    .returning();
  scheduleId = schedule.id;
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(users).where(eq(users.id, userId));
  process.env = env;
});

// Only Date is faked: faking timers wholesale breaks the postgres driver.
function at(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

describe("cron tick", () => {
  it("rejects a request without the secret", async () => {
    const res = await GET(new Request("http://localhost/api/cron/tick"));
    expect(res.status).toBe(401);
  });

  it("creates nothing on a day the RRULE doesn't cover", async () => {
    at("2026-05-12T09:00:00Z"); // Tuesday, inside the 08:00–18:00 window
    const res = await tick();
    expect(res.status).toBe(200);

    expect(await occurrenceFor("2026-05-12")).toHaveLength(0);
    expect(await windowOpensFor("2026-05-12")).toHaveLength(0);
  });

  it("creates the occurrence and reminds on a day it does cover", async () => {
    at("2026-05-13T09:00:00Z"); // Wednesday, same time of day
    const res = await tick();
    expect(res.status).toBe(200);

    expect(await occurrenceFor("2026-05-13")).toHaveLength(1);
    expect((await windowOpensFor("2026-05-13")).length).toBeGreaterThan(0);
  });

  it("is idempotent: a second tick the same day adds no duplicate reminder", async () => {
    at("2026-05-13T09:30:00Z");
    const before = (await windowOpensFor("2026-05-13")).length;
    await tick();
    expect(await windowOpensFor("2026-05-13")).toHaveLength(before);
    expect(await occurrenceFor("2026-05-13")).toHaveLength(1);
  });

  it("still skips the following Tuesday", async () => {
    at("2026-05-19T09:00:00Z"); // Tuesday
    await tick();
    expect(await occurrenceFor("2026-05-19")).toHaveLength(0);
  });
});
