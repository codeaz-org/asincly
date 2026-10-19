import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkIns, members, recordings, schedules, occurrences, teams, users } from "@/db/schema";
import { getAI, type Summary } from "@/lib/ai";
import { aiSecondsRemaining, getEntitlements, recordAiUsage } from "@/lib/billing/entitlements";
import { getPreviousContext } from "@/lib/check-in-context";
import { encrypt } from "@/lib/crypto";
import { displayName } from "@/lib/display";
import { toDisplay } from "@/lib/mentions";
import { presignedGetUrl } from "@/lib/s3";

export type DraftHints = Record<string, "done" | "not_done">;

// processingError marker for "the org's AI minutes are used up this month".
export const QUOTA_EXCEEDED = "quota_exceeded";

// The transcriber's upload limit (Groq: 25 MB). At the recorder's 32 kbit/s
// audio that's well over an hour, so a real take never gets near it.
export const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024;

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
    const [ctx] = await db
      .select({
        checkIn: checkIns,
        teamId: schedules.teamId,
        orgId: teams.orgId,
        authorTz: users.tz,
        aiAllowed: sql<boolean>`${teams.aiEnabled} and not ${users.aiOptOut}`,
      })
      .from(checkIns)
      .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
      .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
      .innerJoin(teams, eq(teams.id, schedules.teamId))
      .innerJoin(users, eq(users.id, checkIns.userId))
      .where(eq(checkIns.id, rec.checkInId));
    if (!ctx) throw new Error("Parent check-in vanished");

    // The team turned AI off, or the author opted out: the video stays,
    // nothing goes to the provider, and the author writes the check-in.
    if (!ctx.aiAllowed) {
      await db.update(recordings).set({ status: "ready", processedAt: new Date() }).where(eq(recordings.id, recordingId));
      return;
    }

    // Hosted plans meter transcription. Over quota, the video stays attached
    // and the author writes the check-in by hand. The browser's duration is
    // only a first guess; what's charged is the length the transcriber reports.
    const claimed = rec.durationMs ? rec.durationMs / 1000 : 0;
    const remaining = await aiSecondsRemaining(ctx.orgId);
    if (remaining !== null && remaining < Math.max(claimed, 1)) {
      await db
        .update(recordings)
        .set({ status: "failed", processingError: QUOTA_EXCEEDED })
        .where(eq(recordings.id, recordingId));
      return;
    }

    // No separate audio track: the video itself, only if it's small enough
    // for the transcriber (the audio slot is capped at upload).
    if (!rec.audioKey && (rec.sizeBytes ?? Infinity) > MAX_TRANSCRIBE_BYTES) throw new Error("No audio track, and the video is too large to transcribe");

    await setStatus("transcribing");
    const ai = await getAI();

    const audioKey = rec.audioKey ?? rec.objectKey;
    // The transcriber fetches it once, right away.
    const audioUrl = await presignedGetUrl(audioKey, 15 * 60);
    const { text: transcript, durationSec } = await ai.transcriber.transcribe({
      audioUrl,
      mimeType: rec.audioKey ? audioMime(rec.audioKey) : rec.mimeType,
      maxBytes: MAX_TRANSCRIBE_BYTES,
    });
    const seconds = Math.max(durationSec ?? 0, claimed) || 60;
    await recordAiUsage(ctx.orgId, seconds);
    // The plan's length limit, checked against the real length: a take that
    // claimed to be short is charged in full and gets no draft.
    const { maxVideoSeconds } = await getEntitlements(ctx.orgId);
    if (seconds > maxVideoSeconds + 10) {
      await db
        .update(recordings)
        .set({ status: "failed", durationMs: Math.round(seconds * 1000), processingError: "Longer than your plan allows" })
        .where(eq(recordings.id, recordingId));
      return;
    }

    await setStatus("drafting");
    const [previous, roster] = await Promise.all([
      getPreviousContext(db, ctx.teamId, rec.userId, ctx.checkIn.occurrenceId),
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
      // The author too, listed last: "@anton, note to self" tags like any
      // name (mentions never notify their author).
      roster: [...roster]
        .sort((a, b) => Number(a.userId === rec.userId) - Number(b.userId === rec.userId))
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
        transcriptCipher: encrypt(transcript, `recording:${recordingId}:transcript`),
        summaryCipher: encrypt(JSON.stringify(summary), `recording:${recordingId}:summary`),
        draftCipher: encrypt(JSON.stringify({ draft, previous: previous.previous, hints }), `recording:${recordingId}:draft`),
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

// After the author sends, the card's summary is rewritten from the check-in
// they actually sent, so a name or fact they corrected in review doesn't
// stay wrong in the summary written from the transcript. Only the sent text
// goes to the model: it's what the author approved. A failure keeps the old
// summary.
export async function resummarizeCheckIn(checkInId: string): Promise<void> {
  const [ctx] = await db
    .select({
      yesterday: checkIns.yesterday,
      today: checkIns.today,
      blockers: checkIns.blockers,
      authorTz: users.tz,
      aiAllowed: sql<boolean>`${teams.aiEnabled} and not ${users.aiOptOut}`,
    })
    .from(checkIns)
    .innerJoin(users, eq(users.id, checkIns.userId))
    .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
    .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
    .innerJoin(teams, eq(teams.id, schedules.teamId))
    .where(eq(checkIns.id, checkInId));
  if (!ctx?.aiAllowed) return;
  const recs = await db
    .select({ id: recordings.id })
    .from(recordings)
    .where(sql`${recordings.checkInId} = ${checkInId} and ${recordings.status} = 'ready' and ${recordings.summaryCipher} <> ''`);
  if (recs.length === 0) return;

  const note = [
    ["Yesterday", ctx.yesterday],
    ["Today", ctx.today],
    ["Blockers", ctx.blockers],
  ]
    .filter(([, md]) => md.trim())
    .map(([label, md]) => `${label}:\n${toDisplay(md)}`)
    .join("\n\n");
  if (!note) return;

  try {
    const summary = await (await getAI()).summarizer.summarize({ transcript: "", note, authorTz: ctx.authorTz });
    if (summary.bullets.length === 0) return;
    for (const r of recs) {
      await db
        .update(recordings)
        .set({ summaryCipher: encrypt(JSON.stringify(summary), `recording:${r.id}:summary`) })
        .where(eq(recordings.id, r.id));
    }
  } catch (e) {
    console.error("[resummarizeCheckIn]", checkInId, e instanceof Error ? e.message : "unknown error");
  }
}
