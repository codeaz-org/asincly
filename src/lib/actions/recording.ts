"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { checkIns, members, occurrences, organizations, recordings, schedules, teams, users } from "@/db/schema";
import { aiConfigured } from "@/lib/ai";
import { CheckInDraftSchema, type PrevItem } from "@/lib/ai/draft-schema";
import { decrypt } from "@/lib/crypto";
import { displayName } from "@/lib/display";
import { composeDraft, type ComposedDraft } from "@/lib/draft";
import { getEntitlements } from "@/lib/billing/entitlements";
import { QUOTA_EXCEEDED, processRecording } from "@/lib/process-recording";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { presignedPutUrl } from "@/lib/s3";

// Only what the recorder produces: webm (Chrome/Firefox), mp4 (Safari), the
// audio-only track for transcription and the jpeg poster frame. Anything else
// never gets a signed PUT.
const MimeType = z
  .string()
  .max(80)
  .regex(/^((video|audio)\/(webm|mp4)(;\s*codecs="?[\w.,\s]+"?)?|image\/jpeg)$/i, "Unsupported file type");

const PresignSchema = z.object({
  checkInId: z.string().uuid(),
  mimeType: MimeType,
  sizeBytes: z.number().int().nonnegative().max(500 * 1024 * 1024), // 500 MB ceiling
});

export type PresignResult =
  | { ok: true; uploadUrl: string; objectKey: string }
  | { ok: false; error: string };

function extensionFor(mime: string): string {
  const [type, sub] = mime.toLowerCase().split(";")[0].split("/");
  if (type === "image") return "jpg";
  if (type === "audio") return sub === "mp4" ? "m4a" : "weba";
  return sub;
}

export async function getUploadUrl(input: {
  checkInId: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<PresignResult> {
  try {
    const user = await requireUser();
    const rl = rateLimit(`upload-url:${user.id}`, 15, 5 * 60 * 1000);
    if (!rl.allowed) return { ok: false, error: "Too many upload attempts — slow down." };
    const result = PresignSchema.safeParse(input);
    if (!result.success) return { ok: false, error: "Unsupported recording format" };
    const parsed = result.data;

    // The caller must own the check-in.
    const [ci] = await db.select().from(checkIns).where(eq(checkIns.id, parsed.checkInId));
    if (!ci || ci.userId !== user.id) return { ok: false, error: "Not your check-in" };

    const objectKey = `check-ins/${parsed.checkInId}/${crypto.randomUUID()}.${extensionFor(parsed.mimeType)}`;
    const uploadUrl = await presignedPutUrl(objectKey, parsed.mimeType);
    return { ok: true, uploadUrl, objectKey };
  } catch (e) {
    console.error("[getUploadUrl]", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't prepare the upload" };
  }
}

const KEY = (checkInId: string) => new RegExp(`^check-ins/${checkInId}/[0-9a-f-]{36}\\.(webm|mp4|jpg|weba|m4a)$`);

const RegisterSchema = z
  .object({
    checkInId: z.string().uuid(),
    objectKey: z.string().min(1).max(200),
    posterKey: z.string().min(1).max(200).nullable().optional(),
    audioKey: z.string().min(1).max(200).nullable().optional(),
    mimeType: MimeType,
    sizeBytes: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative().nullable(),
    // Previous-plan items the author tapped while talking.
    hints: z.record(z.string().regex(/^[0-9a-f]{8}$/), z.enum(["done", "not_done"])).optional(),
    // Private talking points; handed to the drafter, never persisted.
    notes: z.string().max(2000).optional(),
  })
  // Keys must be ones we minted for *this* check-in in getUploadUrl, so a
  // caller can't attach another team's object and get a playback URL for it.
  .refine((v) => [v.objectKey, v.posterKey, v.audioKey].every((k) => k == null || KEY(v.checkInId).test(k)), "Unknown upload");

export type RegisterResult = { ok: true; recordingId: string } | { ok: false; error: string };

export async function registerRecording(input: unknown): Promise<RegisterResult> {
  try {
    const user = await requireUser();
    const result = RegisterSchema.safeParse(input);
    if (!result.success) return { ok: false, error: "Unknown upload" };
    const parsed = result.data;
    if (!rateLimit(`recording:${user.id}`, 12, 60 * 60 * 1000).allowed) {
      return { ok: false, error: "That's a lot of recordings — try again later." };
    }

    const [ci] = await db.select().from(checkIns).where(eq(checkIns.id, parsed.checkInId));
    if (!ci || ci.userId !== user.id) return { ok: false, error: "Not your check-in" };

    const [ctx] = await db
      .select({ orgId: teams.orgId, orgSlug: organizations.slug, teamSlug: teams.slug })
      .from(checkIns)
      .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
      .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
      .innerJoin(teams, eq(teams.id, schedules.teamId))
      .innerJoin(organizations, eq(organizations.id, teams.orgId))
      .where(eq(checkIns.id, parsed.checkInId));
    if (!ctx) return { ok: false, error: "Not your check-in" };

    // The recorder stops at the plan's limit; allow a little slack for
    // encoder timing before refusing.
    const { maxVideoSeconds } = await getEntitlements(ctx.orgId);
    if (parsed.durationMs != null && parsed.durationMs > (maxVideoSeconds + 10) * 1000) {
      return { ok: false, error: `Videos can be up to ${Math.round(maxVideoSeconds / 60)} minutes on your plan.` };
    }

    // One video note per check-in: a new recording replaces the old one.
    // Orphaned bucket objects are swept by the retention job / S3 lifecycle.
    await db.delete(recordings).where(eq(recordings.checkInId, parsed.checkInId));

    const [rec] = await db
      .insert(recordings)
      .values({
        checkInId: parsed.checkInId,
        userId: user.id,
        objectKey: parsed.objectKey,
        posterKey: parsed.posterKey ?? null,
        audioKey: parsed.audioKey ?? null,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes,
        durationMs: parsed.durationMs,
      })
      .returning();

    // A recording is the video for a "require video" team, so an earlier
    // skip reason no longer applies.
    await db
      .update(checkIns)
      .set({ videoSkipReason: null, videoSkipNote: null })
      .where(eq(checkIns.id, parsed.checkInId));

    // Transcribe + draft after the response; the client polls getRecordingDraft.
    after(async () => {
      await processRecording(rec.id, parsed.hints ?? {}, parsed.notes ?? "");
      revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}`);
    });

    return { ok: true, recordingId: rec.id };
  } catch (e) {
    console.error("[registerRecording]", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't attach the video" };
  }
}

export type DraftStatus =
  | { ok: true; status: "uploaded" | "transcribing" | "drafting" | "processing" }
  | { ok: true; status: "ready"; aiConfigured: boolean; draft: ComposedDraft | null }
  | { ok: true; status: "failed"; aiConfigured: boolean; reason?: "quota_exceeded" }
  | { ok: false; error: string };

const DraftRequestSchema = z.object({
  recordingId: z.string().uuid(),
  typed: z.object({
    yesterday: z.string().max(20000),
    today: z.string().max(20000),
    blockers: z.string().max(20000),
  }),
});

// Author-only. Returns the pipeline status and, once ready, the draft merged
// with whatever the author has typed in the meantime.
export async function getRecordingDraft(input: unknown): Promise<DraftStatus> {
  const user = await requireUser();
  const parsed = DraftRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const [rec] = await db
    .select({
      status: recordings.status,
      draftCipher: recordings.draftCipher,
      checkInId: recordings.checkInId,
      processingError: recordings.processingError,
    })
    .from(recordings)
    .where(and(eq(recordings.id, parsed.data.recordingId), eq(recordings.userId, user.id)));
  if (!rec) return { ok: false, error: "Recording not found" };

  if (rec.status === "failed") {
    return {
      ok: true,
      status: "failed",
      aiConfigured: aiConfigured(),
      ...(rec.processingError === QUOTA_EXCEEDED ? { reason: "quota_exceeded" as const } : {}),
    };
  }
  if (rec.status !== "ready") return { ok: true, status: rec.status };
  if (!rec.draftCipher || !aiConfigured()) return { ok: true, status: "ready", aiConfigured: aiConfigured(), draft: null };

  let stored: { draft: unknown; previous?: PrevItem[]; hints?: Record<string, "done" | "not_done"> };
  try {
    stored = JSON.parse(decrypt(rec.draftCipher));
  } catch {
    return { ok: true, status: "failed", aiConfigured: true };
  }
  const draft = CheckInDraftSchema.safeParse(stored.draft);
  if (!draft.success) return { ok: true, status: "failed", aiConfigured: true };

  const roster = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(checkIns)
    .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
    .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
    .innerJoin(members, eq(members.teamId, schedules.teamId))
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(checkIns.id, rec.checkInId));

  const composed = composeDraft(
    { previous: stored.previous ?? [], typed: parsed.data.typed, hints: stored.hints },
    draft.data,
    roster.filter((r) => r.userId !== user.id).map((r) => ({ userId: r.userId, name: displayName(r.name, r.email) })),
  );
  return { ok: true, status: "ready", aiConfigured: true, draft: composed };
}

export async function deleteRecording(recordingId: string) {
  const user = await requireUser();
  const [rec] = await db
    .select()
    .from(recordings)
    .where(and(eq(recordings.id, recordingId), eq(recordings.userId, user.id)));
  if (!rec) throw new Error("Recording not found");
  await db.delete(recordings).where(eq(recordings.id, recordingId));
  // Object stays in the bucket; a scheduled cleanup job removes orphans later.
}
