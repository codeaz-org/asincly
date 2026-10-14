import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { checkIns, members, occurrences, organizations, recordings, schedules, teams, users } from "@/db/schema";

// Requires local Postgres up (pnpm db:up) with migrations applied.

const transcribe = vi.fn(async () => ({ text: "hello" }));
vi.mock("@/lib/ai", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai")>()),
  getAI: async () => ({
    transcriber: { transcribe },
    summarizer: { summarize: vi.fn() },
    drafter: { draft: vi.fn() },
  }),
}));

const { processRecording } = await import("./process-recording");

const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
let orgId: string;
let userId: string;
let teamId: string;
let checkInId: string;

beforeAll(async () => {
  process.env.BILLING_ENABLED = "false";
  const [u] = await db.insert(users).values({ email: `${uniq("ai")}@t.local` }).returning();
  userId = u.id;
  const [org] = await db.insert(organizations).values({ name: "AI", slug: uniq("ai") }).returning();
  orgId = org.id;
  const [t] = await db.insert(teams).values({ orgId, name: "AI", slug: "ai", aiEnabled: false }).returning();
  teamId = t.id;
  await db.insert(members).values({ teamId, userId, role: "member" });
  const [s] = await db
    .insert(schedules)
    .values({ teamId, name: "S", rrule: "FREQ=DAILY", windowOpenLocal: "09:00", windowCloseLocal: "11:00" })
    .returning();
  const [o] = await db.insert(occurrences).values({ scheduleId: s.id, scheduleDate: "2026-01-05" }).returning();
  const [ci] = await db.insert(checkIns).values({ occurrenceId: o.id, userId, localDate: "2026-01-05" }).returning();
  checkInId = ci.id;
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(users).where(eq(users.id, userId));
});

const newRecording = async () =>
  (await db.insert(recordings).values({ checkInId, userId, objectKey: "k", mimeType: "video/webm" }).returning())[0];

describe("AI controls", () => {
  it("a team with AI off never sends audio to the provider", async () => {
    const rec = await newRecording();
    await processRecording(rec.id);
    expect(transcribe).not.toHaveBeenCalled();
    const [after] = await db.select().from(recordings).where(eq(recordings.id, rec.id));
    expect(after).toMatchObject({ status: "ready", transcriptCipher: "", draftCipher: "" });
  });

  it("nor does a member who opted out, on a team that has it on", async () => {
    await db.update(teams).set({ aiEnabled: true }).where(eq(teams.id, teamId));
    await db.update(users).set({ aiOptOut: true }).where(eq(users.id, userId));
    const rec = await newRecording();
    await processRecording(rec.id);
    expect(transcribe).not.toHaveBeenCalled();
  });
});
