import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { auditLogs, checkIns, members, occurrences, organizations, schedules, teams, users } from "@/db/schema";

// Requires local Postgres up (pnpm db:up) with migrations applied.

let currentUserId = "";
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: currentUserId, email: "", name: null, image: null, tz: "UTC" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { reopenCheckIn, saveCheckInDraft } = await import("./check-in");

const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
let orgId: string;
let teamId: string;
let userId: string;
let checkInId: string;

beforeAll(async () => {
  const [u] = await db.insert(users).values({ email: `${uniq("ci")}@t.local`, tz: "UTC" }).returning();
  userId = currentUserId = u.id;
  const [org] = await db.insert(organizations).values({ name: "CI", slug: uniq("ci") }).returning();
  orgId = org.id;
  const [team] = await db.insert(teams).values({ orgId, name: "CI", slug: "ci" }).returning();
  teamId = team.id;
  await db.insert(members).values({ teamId, userId, role: "member" });
  const [s] = await db
    .insert(schedules)
    .values({ teamId, name: "S", rrule: "FREQ=DAILY", windowOpenLocal: "09:00", windowCloseLocal: "11:00" })
    .returning();
  const [o] = await db.insert(occurrences).values({ scheduleId: s.id, scheduleDate: "2026-01-05" }).returning();
  const [ci] = await db
    .insert(checkIns)
    .values({ occurrenceId: o.id, userId, localDate: "2026-01-05", status: "submitted", submittedAt: new Date() })
    .returning();
  checkInId = ci.id;
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("check-in authorship", () => {
  it("reopening a sent check-in is audited", async () => {
    await reopenCheckIn(checkInId);
    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.resourceId, checkInId), eq(auditLogs.action, "check_in.reopen")));
    expect(rows).toHaveLength(1);
  });

  it("a member removed from the team can no longer edit what they wrote there", async () => {
    await saveCheckInDraft({ checkInId, today: "still here" });
    await db.delete(members).where(and(eq(members.teamId, teamId), eq(members.userId, userId)));
    await expect(saveCheckInDraft({ checkInId, today: "after removal" })).rejects.toThrow(/Not your check-in/);
    const [ci] = await db.select({ today: checkIns.today }).from(checkIns).where(eq(checkIns.id, checkInId));
    expect(ci.today).toBe("still here");
  });
});
