"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { withUser } from "@/db/with-user";
import { checkIns, members, occurrences, recordings, schedules, teams, users } from "@/db/schema";
import { aiConfigured } from "@/lib/ai";
import { audit } from "@/lib/audit";
import { authorCheckIn } from "@/lib/check-in-access";
import { CheckInDraftSchema, type PrevItem } from "@/lib/ai/draft-schema";
import { decrypt } from "@/lib/crypto";
import { displayName } from "@/lib/display";
import { composeDraft, type ComposedDraft } from "@/lib/draft";
import { getEntitlements } from "@/lib/billing/entitlements";
import { QUOTA_EXCEEDED, processRecording } from "@/lib/process-recording";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { deleteRecordingObjects, recordingKeys } from "@/lib/recording-objects";
import { historyCutoff } from "@/lib/billing/plans";
import { localDate } from "@/lib/time";
import { presignedGetUrl, presignedPutUrl } from "@/lib/s3";

// Only what the recorder produces: webm (Chrome/Firefox), mp4 (Safari), the
// audio-only track for transcription and the jpeg poster frame. Anything else
// never gets a signed PUT.
const MimeType = z
  .string()
  .max(80)
  .regex(/^((video|audio)\/(webm|mp4)(;\s*codecs="?[\w.,\s]+"?)?|image\/jpeg)$/i, "Unsupported file type");

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

const PresignSchema = z.object({
  checkInId: z.string().uuid(),
  mimeType: MimeType,
  // Signed into the upload URL, so the bucket refuses any other size.
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
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
    const rl = await rateLimit(`upload-url:${user.id}`, 15, 5 * 60 * 1000);
    if (!rl.allowed) return { ok: false, error: "Too many upload attempts — slow down." };
    const result = PresignSchema.safeParse(input);
    if (!result.success) return { ok: false, error: "Unsupported recording format" };
    const parsed = result.data;

    if (!(await authorCheckIn(parsed.checkInId, user.id))) return { ok: false, error: "Not your check-in" };

    const objectKey = `check-ins/${parsed.checkInId}/${crypto.randomUUID()}.${extensionFor(parsed.mimeType)}`;
    const uploadUrl = await presignedPutUrl(objectKey, parsed.mimeType, parsed.sizeBytes);
    return { ok: true, uploadUrl, objectKey };
  } catch (e) {
    console.error("[getUploadUrl]", e instanceof Error ? e.message : "unknown error");
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
    sizeBytes: z.number().int().nonnegative().max(MAX_UPLOAD_BYTES),
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
    if (!(await rateLimit(`recording:${user.id}`, 12, 60 * 60 * 1000)).allowed) {
      return { ok: false, error: "That's a lot of recordings — try again later." };
    }

    const ctx = await authorCheckIn(parsed.checkInId, user.id);
    if (!ctx) return { ok: false, error: "Not your check-in" };

    // The recorder stops at the plan's limit; allow a little slack for
    // encoder timing before refusing.
    const { maxVideoSeconds } = await getEntitlements(ctx.orgId);
    if (parsed.durationMs != null && parsed.durationMs > (maxVideoSeconds + 10) * 1000) {
      return { ok: false, error: `Videos can be up to ${Math.round(maxVideoSeconds / 60)} minutes on your plan.` };
    }

    // One video note per check-in: a new recording replaces the old one,
    // and the old take's objects go with it.
    const replacedKeys = await recordingKeys(eq(recordings.checkInId, parsed.checkInId));
    const rec = await withUser(user.id, async (tx) => {
      await tx.delete(recordings).where(eq(recordings.checkInId, parsed.checkInId));
      const [row] = await tx
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
      await tx
        .update(checkIns)
        .set({ videoSkipReason: null, videoSkipNote: null })
        .where(eq(checkIns.id, parsed.checkInId));
      return row;
    });
    await deleteRecordingObjects(replacedKeys);
    await audit({
      orgId: ctx.orgId,
      actorUserId: user.id,
      action: "recording.create",
      resourceType: "recording",
      resourceId: rec.id,
      meta: { checkInId: parsed.checkInId, replaced: replacedKeys.length > 0 },
    });

    // Transcribe + draft after the response; the client polls getRecordingDraft.
    after(async () => {
      await processRecording(rec.id, parsed.hints ?? {}, parsed.notes ?? "");
      revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}`);
    });

    return { ok: true, recordingId: rec.id };
  } catch (e) {
    console.error("[registerRecording]", e instanceof Error ? e.message : "unknown error");
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
  // Polled every few seconds while a take processes; each ready response
  // decrypts the draft.
  if (!(await rateLimit(`draft-poll:${user.id}`, 120, 5 * 60 * 1000)).allowed) {
    return { ok: false, error: "Slow down" };
  }
  const parsed = DraftRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const [rec] = await withUser(user.id, (tx) =>
    tx
      .select({
        status: recordings.status,
        draftCipher: recordings.draftCipher,
        checkInId: recordings.checkInId,
        processingError: recordings.processingError,
      })
      .from(recordings)
      .where(and(eq(recordings.id, parsed.data.recordingId), eq(recordings.userId, user.id))),
  );
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
    stored = JSON.parse(decrypt(rec.draftCipher, `recording:${parsed.data.recordingId}:draft`));
  } catch {
    return { ok: true, status: "failed", aiConfigured: true };
  }
  const draft = CheckInDraftSchema.safeParse(stored.draft);
  if (!draft.success) return { ok: true, status: "failed", aiConfigured: true };

  const roster = await withUser(user.id, (tx) =>
    tx
      .select({ userId: users.id, name: users.name, email: users.email })
      .from(checkIns)
      .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
      .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
      .innerJoin(members, eq(members.teamId, schedules.teamId))
      .innerJoin(users, eq(users.id, members.userId))
      .where(eq(checkIns.id, rec.checkInId)),
  );

  const composed = composeDraft(
    { previous: stored.previous ?? [], typed: parsed.data.typed, hints: stored.hints },
    draft.data,
    roster.filter((r) => r.userId !== user.id).map((r) => ({ userId: r.userId, name: displayName(r.name, r.email) })),
  );
  return { ok: true, status: "ready", aiConfigured: true, draft: composed };
}

export async function deleteRecording(recordingId: string) {
  const user = await requireUser();
  const id = z.string().uuid().parse(recordingId);
  const [rec] = await withUser(user.id, (tx) =>
    tx.select().from(recordings).where(and(eq(recordings.id, id), eq(recordings.userId, user.id))),
  );
  if (!rec) throw new Error("Recording not found");
  const ctx = await authorCheckIn(rec.checkInId, user.id);
  if (!ctx) throw new Error("Recording not found");
  await withUser(user.id, (tx) => tx.delete(recordings).where(eq(recordings.id, id)));
  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "recording.delete",
    resourceType: "recording",
    resourceId: id,
  });
  await deleteRecordingObjects([rec.objectKey, rec.posterKey, rec.audioKey].filter((k): k is string => !!k));
}

export type PlaybackResult = { ok: true; url: string } | { ok: false; error: string };

// A video URL is minted only when someone presses play, for anyone who can
// see the check-in (members and guests, within the plan's history window).
// Rendering the feed no longer hands out a URL for every video on the page.
export async function getPlaybackUrl(recordingId: unknown): Promise<PlaybackResult> {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(recordingId);
  if (!id.success) return { ok: false, error: "Video not found" };
  if (!(await rateLimit(`playback:${user.id}`, 60, 60_000)).allowed) return { ok: false, error: "Slow down" };

  const [rec] = await withUser(user.id, (tx) =>
    tx
      .select({ objectKey: recordings.objectKey, date: occurrences.scheduleDate, orgId: teams.orgId })
      .from(recordings)
      .innerJoin(checkIns, eq(checkIns.id, recordings.checkInId))
      .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
      .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
      .innerJoin(teams, eq(teams.id, schedules.teamId))
      .innerJoin(members, and(eq(members.teamId, teams.id), eq(members.userId, user.id)))
      .where(eq(recordings.id, id.data)),
  );
  if (!rec) return { ok: false, error: "Video not found" };
  const cutoff = historyCutoff(await getEntitlements(rec.orgId), localDate(new Date(), user.tz));
  if (cutoff && rec.date < cutoff) return { ok: false, error: "Video not found" };

  return { ok: true, url: await presignedGetUrl(rec.objectKey, PLAYBACK_URL_SECONDS) };
}

// Long enough for the browser's range requests through a full-length take;
// the player asks again if it does expire mid-watch.
const PLAYBACK_URL_SECONDS = 15 * 60;
