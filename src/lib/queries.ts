import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { checkIns, members, occurrences, recordings, schedules, users } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { presignedGetUrl } from "@/lib/s3";
import type { Summary } from "@/lib/ai";

export type FeedRecording = {
  id: string;
  mimeType: string;
  durationMs: number | null;
  status: "uploaded" | "processing" | "ready" | "failed";
  playbackUrl: string;
  summary: Summary | null;
};

export type FeedEntry = {
  checkInId: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  yesterday: string;
  today: string;
  blockers: string;
  submittedAt: Date;
  status: "draft" | "submitted";
  recordings: FeedRecording[];
};

export type OccurrenceSummary = {
  occurrenceId: string;
  scheduleDate: string;
  scheduleId: string;
  scheduleName: string;
  entries: FeedEntry[];
};

// Feed for a team: today's occurrence (if any) plus the last N recent
// occurrences with at least one submitted check-in.
export async function getTeamFeed(teamId: string, todayISO: string) {
  const activeSchedules = await db
    .select({ id: schedules.id, name: schedules.name })
    .from(schedules)
    .where(and(eq(schedules.teamId, teamId), eq(schedules.active, true)));

  if (activeSchedules.length === 0) {
    return { today: null as OccurrenceSummary | null, past: [] as OccurrenceSummary[] };
  }

  const scheduleIds = activeSchedules.map((s) => s.id);
  const nameById = new Map(activeSchedules.map((s) => [s.id, s.name] as const));

  // Recent occurrences: today plus the previous ~14 calendar days.
  const cutoff = new Date(`${todayISO}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 14);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  const occs = await db
    .select({
      id: occurrences.id,
      scheduleId: occurrences.scheduleId,
      scheduleDate: occurrences.scheduleDate,
    })
    .from(occurrences)
    .where(
      and(inArray(occurrences.scheduleId, scheduleIds), gte(occurrences.scheduleDate, cutoffISO)),
    )
    .orderBy(desc(occurrences.scheduleDate));

  if (occs.length === 0) {
    return { today: null, past: [] };
  }

  const rows = await db
    .select({
      checkInId: checkIns.id,
      occurrenceId: checkIns.occurrenceId,
      userId: checkIns.userId,
      userName: users.name,
      userEmail: users.email,
      yesterday: checkIns.yesterday,
      today: checkIns.today,
      blockers: checkIns.blockers,
      submittedAt: checkIns.submittedAt,
      status: checkIns.status,
    })
    .from(checkIns)
    .innerJoin(users, eq(users.id, checkIns.userId))
    .where(
      and(
        inArray(
          checkIns.occurrenceId,
          occs.map((o) => o.id),
        ),
        eq(checkIns.status, "submitted"),
        isNotNull(checkIns.submittedAt),
      ),
    )
    .orderBy(desc(checkIns.submittedAt));

  // Load recordings for these check-ins in one round-trip.
  const recRows =
    rows.length === 0
      ? []
      : await db
          .select({
            id: recordings.id,
            checkInId: recordings.checkInId,
            objectKey: recordings.objectKey,
            mimeType: recordings.mimeType,
            durationMs: recordings.durationMs,
            status: recordings.status,
            summaryCipher: recordings.summaryCipher,
          })
          .from(recordings)
          .where(
            inArray(
              recordings.checkInId,
              rows.map((r) => r.checkInId),
            ),
          );

  const recsByCheckIn = new Map<string, FeedRecording[]>();
  for (const r of recRows) {
    const playbackUrl = await presignedGetUrl(r.objectKey);
    let summary: Summary | null = null;
    if (r.summaryCipher) {
      try {
        summary = JSON.parse(decrypt(r.summaryCipher));
      } catch {
        summary = null;
      }
    }
    const arr = recsByCheckIn.get(r.checkInId) ?? [];
    arr.push({
      id: r.id,
      mimeType: r.mimeType,
      durationMs: r.durationMs,
      status: r.status,
      playbackUrl,
      summary,
    });
    recsByCheckIn.set(r.checkInId, arr);
  }

  const grouped = new Map<string, FeedEntry[]>();
  for (const r of rows) {
    const arr = grouped.get(r.occurrenceId) ?? [];
    arr.push({
      checkInId: r.checkInId,
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      yesterday: r.yesterday,
      today: r.today,
      blockers: r.blockers,
      submittedAt: r.submittedAt!,
      status: r.status,
      recordings: recsByCheckIn.get(r.checkInId) ?? [],
    });
    grouped.set(r.occurrenceId, arr);
  }

  const summaries: OccurrenceSummary[] = occs.map((o) => ({
    occurrenceId: o.id,
    scheduleDate: o.scheduleDate,
    scheduleId: o.scheduleId,
    scheduleName: nameById.get(o.scheduleId) ?? "",
    entries: grouped.get(o.id) ?? [],
  }));

  const today = summaries.find((s) => s.scheduleDate === todayISO) ?? null;
  const past = summaries.filter(
    (s) => s.scheduleDate !== todayISO && s.entries.length > 0,
  );

  return { today, past };
}

export type MyCheckInToday = {
  id: string;
  status: "draft" | "submitted";
  hasContent: boolean;
} | null;

export async function getMyCheckInForOccurrence(
  occurrenceId: string | undefined,
  userId: string,
): Promise<MyCheckInToday> {
  if (!occurrenceId) return null;
  const [row] = await db
    .select({
      id: checkIns.id,
      status: checkIns.status,
      yesterday: checkIns.yesterday,
      today: checkIns.today,
      blockers: checkIns.blockers,
    })
    .from(checkIns)
    .where(and(eq(checkIns.occurrenceId, occurrenceId), eq(checkIns.userId, userId)));
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    hasContent: !!(row.yesterday.trim() || row.today.trim() || row.blockers.trim()),
  };
}

export async function getTeamRoster(teamId: string) {
  return db
    .select({
      memberId: members.id,
      role: members.role,
      userId: users.id,
      name: users.name,
      email: users.email,
      tz: users.tz,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.teamId, teamId));
}
