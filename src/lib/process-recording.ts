import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checkIns, members, recordings, schedules, occurrences, users } from "@/db/schema";
import { getAI, type Summary } from "@/lib/ai";
import { getPreviousContext } from "@/lib/check-in-context";
import { encrypt } from "@/lib/crypto";
import { displayName } from "@/lib/display";
import { presignedGetUrl } from "@/lib/s3";

export type DraftHints = Record<string, "done" | "not_done">;

// One recording end to end: transcribe the audio track → draft the check-in
// against the author's previous plan and team roster → encrypt → persist.
// Runs after the response (next/server `after`) and reports progress through
// recording.status so the author's screen can show what's happening.
// Transcript, draft and summary contents are never logged.
export async function processRecording(recordingId: string, hints: DraftHints = {}, notes = ""): Promise<void> {
  const [rec] = await db.select().from(recordings).where(eq(recordings.id, recordingId));
  if (!rec) return;
  if (rec.status !== "uploaded" && rec.status !== "failed") return;

  const setStatus = (status: (typeof recordings.$inferSelect)["status"]) =>
    db.update(recordings).set({ status, processingError: null }).where(eq(recordings.id, recordingId));

  try {
    await setStatus("transcribing");
    const ai = await getAI();

    const [ctx] = await db
      .select({
        checkIn: checkIns,
        teamId: schedules.teamId,
        authorTz: users.tz,
      })
      .from(checkIns)
      .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
      .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
      .innerJoin(users, eq(users.id, checkIns.userId))
      .where(eq(checkIns.id, rec.checkInId));
    if (!ctx) throw new Error("Parent check-in vanished");

    const audioKey = rec.audioKey ?? rec.objectKey;
    const audioUrl = await presignedGetUrl(audioKey);
    const { text: transcript } = await ai.transcriber.transcribe({
      audioUrl,
      mimeType: rec.audioKey ? audioMime(rec.audioKey) : rec.mimeType,
    });

    await setStatus("drafting");
    const [previous, roster] = await Promise.all([
      getPreviousContext(ctx.teamId, rec.userId, ctx.checkIn.occurrenceId),
      db
        .select({ userId: users.id, name: users.name, email: users.email })
        .from(members)
        .innerJoin(users, eq(users.id, members.userId))
        .where(eq(members.teamId, ctx.teamId)),
    ]);

    const draft = await ai.drafter.draft({
      transcript,
      typed: { yesterday: ctx.checkIn.yesterday, today: ctx.checkIn.today, blockers: ctx.checkIn.blockers },
      previous: previous.previous,
      openBlockers: previous.openBlockers,
      roster: roster
        .filter((r) => r.userId !== rec.userId)
        .map((r) => ({ userId: r.userId, name: displayName(r.name, r.email) })),
      authorTz: ctx.authorTz,
      hints,
      notes,
    });

    const summary: Summary = {
      bullets: draft.bullets,
      actionItems: draft.today.map((t) => t.text),
      blockers: draft.blockers.map((b) => b.text),
      mentions: draft.mentions.map((m) => m.heardAs ?? m.userId),
    };

    await db
      .update(recordings)
      .set({
        status: "ready",
        processedAt: new Date(),
        transcriptCipher: encrypt(transcript),
        summaryCipher: encrypt(JSON.stringify(summary)),
        draftCipher: encrypt(JSON.stringify({ draft, previous: previous.previous, hints })),
      })
      .where(eq(recordings.id, recordingId));
  } catch (e) {
    // Error messages from providers never include transcript text (see groq.ts).
    console.error("[processRecording]", recordingId, e instanceof Error ? e.message : "unknown error");
    await db
      .update(recordings)
      .set({ status: "failed", processingError: e instanceof Error ? e.message.slice(0, 300) : "failed" })
      .where(eq(recordings.id, recordingId));
  }
}

function audioMime(key: string): string {
  return key.endsWith(".m4a") ? "audio/mp4" : "audio/webm";
}
