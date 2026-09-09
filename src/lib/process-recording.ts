import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checkIns, recordings, users } from "@/db/schema";
import { getAI, type Summary } from "@/lib/ai";
import { encrypt } from "@/lib/crypto";
import { presignedGetUrl } from "@/lib/s3";

// End-to-end processing for one recording: fetch → transcribe → summarize
// → encrypt → persist. Runs synchronously today because the default
// providers are the no-op stubs; when Deepgram/Anthropic are wired this
// moves into an Inngest step (Phase 4).
export async function processRecording(recordingId: string): Promise<void> {
  const [rec] = await db.select().from(recordings).where(eq(recordings.id, recordingId));
  if (!rec) return;
  if (rec.status !== "uploaded" && rec.status !== "failed") return;

  await db
    .update(recordings)
    .set({ status: "processing", processingError: null })
    .where(eq(recordings.id, recordingId));

  try {
    const ai = await getAI();
    const [ci] = await db.select().from(checkIns).where(eq(checkIns.id, rec.checkInId));
    if (!ci) throw new Error("Parent check-in vanished");
    const [author] = await db.select().from(users).where(eq(users.id, rec.userId));
    const tz = author?.tz ?? "UTC";

    const audioUrl = await presignedGetUrl(rec.objectKey);
    const { text: transcript } = await ai.transcriber.transcribe({
      audioUrl,
      mimeType: rec.mimeType,
    });

    const noteMd = [ci.yesterday, ci.today, ci.blockers].filter(Boolean).join("\n\n");
    const summary: Summary = await ai.summarizer.summarize({
      transcript,
      note: noteMd,
      authorTz: tz,
    });

    await db
      .update(recordings)
      .set({
        status: "ready",
        processedAt: new Date(),
        transcriptCipher: encrypt(transcript),
        summaryCipher: encrypt(JSON.stringify(summary)),
      })
      .where(eq(recordings.id, recordingId));
  } catch (e) {
    console.error("[processRecording]", e);
    await db
      .update(recordings)
      .set({
        status: "failed",
        processingError: e instanceof Error ? e.message : String(e),
      })
      .where(eq(recordings.id, recordingId));
  }
}
