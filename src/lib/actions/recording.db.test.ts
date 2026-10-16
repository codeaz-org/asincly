import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { checkIns, members, occurrences, organizations, recordings, schedules, teams, users } from "@/db/schema";
import { listObjects, presignedPutUrl } from "@/lib/s3";

// Requires local Postgres + MinIO up (pnpm db:up) with migrations applied.

let currentUserId = "";
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: currentUserId, email: "", name: null, image: null, tz: "UTC" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("@/lib/process-recording", () => ({ processRecording: async () => {}, QUOTA_EXCEEDED: "quota_exceeded", MAX_TRANSCRIBE_BYTES: 25 * 1024 * 1024 }));

const { getUploadUrl, registerRecording } = await import("./recording");
const { deleteTeam } = await import("./team-admin");

const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
let orgId: string;
let teamId: string;
const ids = { author: "", other: "" };
let checkInId: string;

beforeAll(async () => {
  process.env.BILLING_ENABLED = "false";
  for (const k of Object.keys(ids) as (keyof typeof ids)[]) {
    const [u] = await db.insert(users).values({ email: `${uniq(k)}@t.local` }).returning();
    ids[k] = u.id;
  }
  const [org] = await db.insert(organizations).values({ name: "Rec", slug: uniq("rec"), ownerUserId: ids.author }).returning();
  orgId = org.id;
  // Two teams so the org survives deleting one.
  const [t] = await db.insert(teams).values({ orgId, name: "Rec", slug: "rec" }).returning();
  await db.insert(teams).values({ orgId, name: "Other", slug: "other" });
  teamId = t.id;
  await db.insert(members).values([
    { teamId, userId: ids.author, role: "owner" },
    { teamId, userId: ids.other, role: "member" },
  ]);
  const [s] = await db
    .insert(schedules)
    .values({ teamId, name: "S", rrule: "FREQ=DAILY", windowOpenLocal: "09:00", windowCloseLocal: "11:00" })
    .returning();
  const [o] = await db.insert(occurrences).values({ scheduleId: s.id, scheduleDate: "2026-01-05" }).returning();
  const [ci] = await db.insert(checkIns).values({ occurrenceId: o.id, userId: ids.author, localDate: "2026-01-05" }).returning();
  checkInId = ci.id;
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  for (const id of Object.values(ids)) await db.delete(users).where(eq(users.id, id));
});

const put = async (key: string) => {
  const res = await fetch(await presignedPutUrl(key, "video/webm", 1), { method: "PUT", headers: { "content-type": "video/webm" }, body: "x" });
  expect(res.ok).toBe(true);
};
const exists = async (key: string) => {
  for await (const o of listObjects(key)) if (o.key === key) return true;
  return false;
};

describe("recording uploads", () => {
  it("signs only the recorder's formats, within the size cap, for the author", async () => {
    currentUserId = ids.author;
    expect(await getUploadUrl({ checkInId, mimeType: "video/webm", sizeBytes: 1000 })).toMatchObject({ ok: true });
    expect(await getUploadUrl({ checkInId, mimeType: "text/html", sizeBytes: 1000 })).toMatchObject({ ok: false });
    expect(await getUploadUrl({ checkInId, mimeType: "video/webm", sizeBytes: 501 * 1024 * 1024 })).toMatchObject({ ok: false });
    // The audio track has to fit the transcriber; a poster is one frame.
    expect(await getUploadUrl({ checkInId, mimeType: "audio/webm", sizeBytes: 26 * 1024 * 1024 })).toMatchObject({ ok: false });
    expect(await getUploadUrl({ checkInId, mimeType: "image/jpeg", sizeBytes: 3 * 1024 * 1024 })).toMatchObject({ ok: false });
    currentUserId = ids.other;
    expect(await getUploadUrl({ checkInId, mimeType: "video/webm", sizeBytes: 1000 })).toEqual({ ok: false, error: "Not your check-in" });
  });

  it("only attaches keys minted for this check-in", async () => {
    currentUserId = ids.author;
    const foreign = `check-ins/${crypto.randomUUID()}/${crypto.randomUUID()}.webm`;
    const res = await registerRecording({ checkInId, objectKey: foreign, mimeType: "video/webm", sizeBytes: 1, durationMs: 1000 });
    expect(res).toEqual({ ok: false, error: "Unknown upload" });
    // Each slot takes its own kind of file: no video behind the poster.
    const video = `check-ins/${checkInId}/${crypto.randomUUID()}.webm`;
    const swapped = await registerRecording({ checkInId, objectKey: video, posterKey: video, mimeType: "video/webm", sizeBytes: 1, durationMs: 1000 });
    expect(swapped).toEqual({ ok: false, error: "Unknown upload" });
  });

  it("deleting the team deletes its recordings' files, not just the rows", async () => {
    currentUserId = ids.author;
    const key = `check-ins/${checkInId}/${crypto.randomUUID()}.webm`;
    await put(key);
    const res = await registerRecording({ checkInId, objectKey: key, mimeType: "video/webm", sizeBytes: 1, durationMs: 1000 });
    expect(res).toMatchObject({ ok: true });

    await expect(deleteTeam(teamId)).rejects.toThrow("redirect:/");
    expect(await db.select().from(recordings).where(eq(recordings.checkInId, checkInId))).toHaveLength(0);
    expect(await exists(key)).toBe(false);
  });
});
