import { inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { recordings } from "@/db/schema";
import { deleteObjects, listObjects } from "@/lib/s3";

// Every bucket object a set of recording rows points at. Select these before
// deleting the rows (directly or by cascade); afterwards they can't be found.
export async function recordingKeys(where: SQL | undefined): Promise<string[]> {
  if (!where) return [];
  const rows = await db
    .select({ o: recordings.objectKey, p: recordings.posterKey, a: recordings.audioKey })
    .from(recordings)
    .where(where);
  return rows.flatMap((r) => [r.o, r.p, r.a]).filter((k): k is string => !!k);
}

// Called after the rows are gone. A failure here is logged, not raised: the
// user's delete already happened, and sweepOrphanObjects retries tomorrow.
export async function deleteRecordingObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await deleteObjects(keys);
  } catch (e) {
    console.error("[storage] delete failed; the orphan sweep will retry", e instanceof Error ? e.message : "unknown error");
  }
}

// Objects no recording row references: uploads that were never registered,
// replaced takes, and deletes that failed above. The grace period covers an
// upload whose row isn't written yet.
// ponytail: lists the whole check-ins/ prefix once a day; partition by key
// prefix or switch to bucket inventory reports past ~millions of objects.
export async function sweepOrphanObjects(now: Date, graceMs = 24 * 3600 * 1000): Promise<number> {
  let deleted = 0;
  let batch: { key: string }[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const keys = batch.map((b) => b.key);
    const live = await db
      .select({ o: recordings.objectKey, p: recordings.posterKey, a: recordings.audioKey })
      .from(recordings)
      .where(or(inArray(recordings.objectKey, keys), inArray(recordings.posterKey, keys), inArray(recordings.audioKey, keys)));
    const referenced = new Set(live.flatMap((r) => [r.o, r.p, r.a]));
    const orphans = keys.filter((k) => !referenced.has(k));
    if (orphans.length) {
      await deleteObjects(orphans);
      deleted += orphans.length;
    }
    batch = [];
  };
  for await (const o of listObjects("check-ins/")) {
    if (o.lastModified && now.getTime() - o.lastModified.getTime() < graceMs) continue;
    batch.push(o);
    if (batch.length >= 500) await flush();
  }
  await flush();
  return deleted;
}

