"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { checkIns, occurrences, organizations, recordings, schedules, teams } from "@/db/schema";
import { processRecording } from "@/lib/process-recording";
import { requireUser } from "@/lib/session";
import { presignedPutUrl } from "@/lib/s3";

const PresignSchema = z.object({
  checkInId: z.string().uuid(),
  mimeType: z.string().max(80),
  sizeBytes: z.number().int().nonnegative().max(500 * 1024 * 1024), // 500 MB ceiling
});

export type PresignResult =
  | { ok: true; uploadUrl: string; objectKey: string }
  | { ok: false; error: string };

export async function getUploadUrl(input: {
  checkInId: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<PresignResult> {
  try {
    const user = await requireUser();
    const parsed = PresignSchema.parse(input);

    // The caller must own the check-in.
    const [ci] = await db.select().from(checkIns).where(eq(checkIns.id, parsed.checkInId));
    if (!ci || ci.userId !== user.id) return { ok: false, error: "Not your check-in" };

    const ext = parsed.mimeType.split("/")[1]?.split(";")[0] ?? "bin";
    const objectKey = `check-ins/${parsed.checkInId}/${crypto.randomUUID()}.${ext}`;

    const uploadUrl = await presignedPutUrl(objectKey, parsed.mimeType);
    return { ok: true, uploadUrl, objectKey };
  } catch (e) {
    console.error("[getUploadUrl]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Upload URL failed" };
  }
}

const RegisterSchema = z.object({
  checkInId: z.string().uuid(),
  objectKey: z.string().min(1),
  mimeType: z.string().max(80),
  sizeBytes: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().nullable(),
});

export type RegisterResult =
  | { ok: true; recordingId: string }
  | { ok: false; error: string };

export async function registerRecording(input: unknown): Promise<RegisterResult> {
  try {
    const user = await requireUser();
    const parsed = RegisterSchema.parse(input);

    const [ci] = await db.select().from(checkIns).where(eq(checkIns.id, parsed.checkInId));
    if (!ci || ci.userId !== user.id) return { ok: false, error: "Not your check-in" };

    const [rec] = await db
      .insert(recordings)
      .values({
        checkInId: parsed.checkInId,
        userId: user.id,
        objectKey: parsed.objectKey,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes,
        durationMs: parsed.durationMs,
      })
      .returning();

    // Revalidate the team feed so the new recording shows up.
    const [ctx] = await db
      .select({ orgSlug: organizations.slug, teamSlug: teams.slug })
      .from(checkIns)
      .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
      .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
      .innerJoin(teams, eq(teams.id, schedules.teamId))
      .innerJoin(organizations, eq(organizations.id, teams.orgId))
      .where(eq(checkIns.id, parsed.checkInId));
    if (ctx) revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}`);

    // Fire the AI pipeline. With noop providers this is instant; when
    // Deepgram/Anthropic are wired we'll move this to Inngest.
    await processRecording(rec.id);
    if (ctx) revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}`);

    return { ok: true, recordingId: rec.id };
  } catch (e) {
    console.error("[registerRecording]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Register failed" };
  }
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
