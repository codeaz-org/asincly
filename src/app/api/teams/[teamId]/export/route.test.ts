import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { auditLogs, checkIns, members, occurrences, organizations, recordings, schedules, teams, users } from "@/db/schema";
import { encrypt } from "@/lib/crypto";

// Requires local Postgres up (pnpm db:up) with migrations applied.

let currentUserId = "";
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: currentUserId, email: "", name: null, image: null, tz: "UTC" }),
}));

const { GET } = await import("./route");

const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
let orgId: string;
let teamId: string;
const ids = { owner: "", member: "" };

beforeAll(async () => {
  for (const k of Object.keys(ids) as (keyof typeof ids)[]) {
    const [u] = await db.insert(users).values({ email: `${uniq(k)}@t.local` }).returning();
    ids[k] = u.id;
  }
  const [org] = await db.insert(organizations).values({ name: "Exp", slug: uniq("exp"), ownerUserId: ids.owner }).returning();
  orgId = org.id;
  const [t] = await db.insert(teams).values({ orgId, name: "Exp", slug: "exp" }).returning();
  teamId = t.id;
  await db.insert(members).values([
    { teamId, userId: ids.owner, role: "owner" },
    { teamId, userId: ids.member, role: "member" },
  ]);
  const [s] = await db
    .insert(schedules)
    .values({ teamId, name: "S", rrule: "FREQ=DAILY", windowOpenLocal: "09:00", windowCloseLocal: "11:00" })
    .returning();
  const [o] = await db.insert(occurrences).values({ scheduleId: s.id, scheduleDate: "2026-01-05" }).returning();
  const [ci] = await db
    .insert(checkIns)
    .values({ occurrenceId: o.id, userId: ids.member, localDate: "2026-01-05", today: "- ship", status: "submitted" })
    .returning();
  const [rec] = await db.insert(recordings).values({ checkInId: ci.id, userId: ids.member, objectKey: "k", mimeType: "video/webm" }).returning();
  await db
    .update(recordings)
    .set({ transcriptCipher: encrypt("the secret plan", `recording:${rec.id}:transcript`) })
    .where(eq(recordings.id, rec.id));
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  for (const id of Object.values(ids)) await db.delete(users).where(eq(users.id, id));
});

const exportAs = (userId: string) => {
  currentUserId = userId;
  return GET(new Request("http://localhost/x"), { params: Promise.resolve({ teamId }) });
};

describe("team export", () => {
  it("is for the team owner only", async () => {
    expect((await exportAs(ids.member)).status).toBe(403);
  });

  it("returns every check-in with transcripts decrypted, and is audited", async () => {
    const res = await exportAs(ids.owner);
    expect(res.status).toBe(200);
    const bundle = await res.json();
    expect(bundle.checkIns).toHaveLength(1);
    expect(bundle.recordings[0].transcript).toBe("the secret plan");
    expect(bundle.recordings[0].transcriptCipher).toBeUndefined();
    const audited = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.orgId, orgId), eq(auditLogs.action, "team.export")));
    expect(audited).toHaveLength(1);
  });
});
