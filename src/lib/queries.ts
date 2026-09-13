import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  blockerActions,
  checkInComments,
  checkInReactions,
  checkIns,
  memberAway,
  members,
  occurrences,
  recordings,
  schedules,
  users,
} from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { blockerItems, type BlockerItem } from "@/lib/note-items";
import { presignedGetUrl } from "@/lib/s3";
import { localDate } from "@/lib/time";
import type { Summary } from "@/lib/ai";

// Read models for the app screens. Callers must already have checked that
// the viewer is a member of `teamId` (getTeamBySlug does this).

export type FeedRecording = {
  id: string;
  mimeType: string;
  durationMs: number | null;
  status: (typeof recordings.$inferSelect)["status"];
  playbackUrl: string;
  posterUrl: string | null;
  summary: Summary | null;
};

export type ReactionSummary = { emoji: string; count: number; mine: boolean; names: string[] };

export type FeedBlocker = BlockerItem & {
  helperIds: string[];
  resolved: boolean;
};

export type FeedEntry = {
  checkInId: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  userTz: string;
  yesterday: string;
  today: string;
  blockers: string;
  submittedAt: Date;
  status: "draft" | "submitted";
  recordings: FeedRecording[];
  reactions: ReactionSummary[];
  commentCount: number;
  blockerItems: FeedBlocker[];
  videoSkipReason: string | null;
  videoSkipNote: string | null;
};

export type Schedule = {
  id: string;
  name: string;
  rrule: string;
  windowOpenLocal: string;
  windowCloseLocal: string;
};

export async function getActiveSchedules(teamId: string): Promise<Schedule[]> {
  return db
    .select({
      id: schedules.id,
      name: schedules.name,
      rrule: schedules.rrule,
      windowOpenLocal: schedules.windowOpenLocal,
      windowCloseLocal: schedules.windowCloseLocal,
    })
    .from(schedules)
    .where(and(eq(schedules.teamId, teamId), eq(schedules.active, true)))
    .orderBy(asc(schedules.createdAt));
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

export type Roster = Awaited<ReturnType<typeof getTeamRoster>>;

// ────────── Days ──────────

export type DaySummary = { date: string; count: number };

// Recent schedule dates that have at least one submitted check-in, newest first.
export async function listRecentDays(teamId: string, todayISO: string, days = 14): Promise<DaySummary[]> {
  const cutoff = new Date(`${todayISO}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const rows = await db
    .select({
      date: occurrences.scheduleDate,
      count: sql<number>`count(${checkIns.id})::int`,
    })
    .from(occurrences)
    .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
    .innerJoin(checkIns, and(eq(checkIns.occurrenceId, occurrences.id), eq(checkIns.status, "submitted")))
    .where(and(eq(schedules.teamId, teamId), gte(occurrences.scheduleDate, cutoff.toISOString().slice(0, 10))))
    .groupBy(occurrences.scheduleDate)
    .orderBy(desc(occurrences.scheduleDate));
  return rows;
}

// ────────── One day's feed ──────────

async function loadRecordings(checkInIds: string[]): Promise<Map<string, FeedRecording[]>> {
  const out = new Map<string, FeedRecording[]>();
  if (checkInIds.length === 0) return out;
  const rows = await db
    .select({
      id: recordings.id,
      checkInId: recordings.checkInId,
      objectKey: recordings.objectKey,
      posterKey: recordings.posterKey,
      mimeType: recordings.mimeType,
      durationMs: recordings.durationMs,
      status: recordings.status,
      summaryCipher: recordings.summaryCipher,
    })
    .from(recordings)
    .where(inArray(recordings.checkInId, checkInIds))
    .orderBy(asc(recordings.createdAt));

  const resolved = await Promise.all(
    rows.map(async (r) => {
      const [playbackUrl, posterUrl] = await Promise.all([
        presignedGetUrl(r.objectKey),
        r.posterKey ? presignedGetUrl(r.posterKey) : Promise.resolve(null),
      ]);
      let summary: Summary | null = null;
      if (r.summaryCipher) {
        try {
          summary = JSON.parse(decrypt(r.summaryCipher)) as Summary;
        } catch {
          summary = null;
        }
      }
      return {
        checkInId: r.checkInId,
        rec: { id: r.id, mimeType: r.mimeType, durationMs: r.durationMs, status: r.status, playbackUrl, posterUrl, summary },
      };
    }),
  );
  for (const { checkInId, rec } of resolved) {
    const arr = out.get(checkInId) ?? [];
    arr.push(rec);
    out.set(checkInId, arr);
  }
  return out;
}

// Reactions grouped by emoji in first-used order. Keys are check-in ids for
// reactions on a check-in, and comment ids for reactions on a reply.
async function loadReactions(checkInIds: string[], viewerId: string) {
  const onCheckIns = new Map<string, ReactionSummary[]>();
  const onComments = new Map<string, ReactionSummary[]>();
  if (checkInIds.length === 0) return { onCheckIns, onComments };
  const rows = await db
    .select({
      checkInId: checkInReactions.checkInId,
      commentId: checkInReactions.commentId,
      emoji: checkInReactions.emoji,
      userId: checkInReactions.userId,
      name: users.name,
      email: users.email,
    })
    .from(checkInReactions)
    .innerJoin(users, eq(users.id, checkInReactions.userId))
    .where(inArray(checkInReactions.checkInId, checkInIds))
    .orderBy(asc(checkInReactions.createdAt));
  for (const r of rows) {
    const target = r.commentId ? onComments : onCheckIns;
    const key = r.commentId ?? r.checkInId;
    const list = target.get(key) ?? [];
    let entry = list.find((x) => x.emoji === r.emoji);
    if (!entry) {
      entry = { emoji: r.emoji, count: 0, mine: false, names: [] };
      list.push(entry);
    }
    entry.count++;
    entry.mine ||= r.userId === viewerId;
    entry.names.push(r.userId === viewerId ? "You" : r.name?.trim() || r.email.split("@")[0]);
    target.set(key, list);
  }
  return { onCheckIns, onComments };
}

async function loadCommentCounts(checkInIds: string[]) {
  const out = new Map<string, number>();
  if (checkInIds.length === 0) return out;
  const rows = await db
    .select({ checkInId: checkInComments.checkInId, count: sql<number>`count(*)::int` })
    .from(checkInComments)
    .where(and(inArray(checkInComments.checkInId, checkInIds), isNull(checkInComments.deletedAt)))
    .groupBy(checkInComments.checkInId);
  for (const r of rows) out.set(r.checkInId, r.count);
  return out;
}

async function loadBlockerActions(checkInIds: string[]) {
  const out = new Map<string, Array<{ itemKey: string; userId: string; kind: "help" | "resolved" }>>();
  if (checkInIds.length === 0) return out;
  const rows = await db
    .select({
      checkInId: blockerActions.checkInId,
      itemKey: blockerActions.itemKey,
      userId: blockerActions.userId,
      kind: blockerActions.kind,
    })
    .from(blockerActions)
    .where(inArray(blockerActions.checkInId, checkInIds));
  for (const r of rows) {
    const arr = out.get(r.checkInId) ?? [];
    arr.push(r);
    out.set(r.checkInId, arr);
  }
  return out;
}

const entryColumns = {
  checkInId: checkIns.id,
  userId: checkIns.userId,
  userName: users.name,
  userEmail: users.email,
  userTz: users.tz,
  yesterday: checkIns.yesterday,
  today: checkIns.today,
  blockers: checkIns.blockers,
  submittedAt: checkIns.submittedAt,
  status: checkIns.status,
  videoSkipReason: checkIns.videoSkipReason,
  videoSkipNote: checkIns.videoSkipNote,
};

type EntryRow = {
  checkInId: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  userTz: string;
  yesterday: string;
  today: string;
  blockers: string;
  submittedAt: Date | null;
  status: "draft" | "submitted";
  videoSkipReason: string | null;
  videoSkipNote: string | null;
};

async function hydrateEntries(rows: EntryRow[], viewerId: string): Promise<FeedEntry[]> {
  const ids = rows.map((r) => r.checkInId);
  const [recs, reactions, comments, actions] = await Promise.all([
    loadRecordings(ids),
    loadReactions(ids, viewerId),
    loadCommentCounts(ids),
    loadBlockerActions(ids),
  ]);
  return rows.map((r) => {
    const acts = actions.get(r.checkInId) ?? [];
    return {
      ...r,
      submittedAt: r.submittedAt ?? new Date(0),
      recordings: recs.get(r.checkInId) ?? [],
      reactions: reactions.onCheckIns.get(r.checkInId) ?? [],
      commentCount: comments.get(r.checkInId) ?? 0,
      blockerItems: blockerItems(r.blockers).map((b) => ({
        ...b,
        helperIds: acts.filter((a) => a.itemKey === b.key && a.kind === "help").map((a) => a.userId),
        resolved: acts.some((a) => a.itemKey === b.key && a.kind === "resolved"),
      })),
    };
  });
}

// Every submitted check-in on `dateISO` across the team's active schedules,
// oldest first (the order the day actually happened in).
export async function getDayFeed(teamId: string, dateISO: string, viewerId: string): Promise<FeedEntry[]> {
  const rows = await db
    .select(entryColumns)
    .from(checkIns)
    .innerJoin(users, eq(users.id, checkIns.userId))
    .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
    .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
    .where(
      and(
        eq(schedules.teamId, teamId),
        eq(occurrences.scheduleDate, dateISO),
        eq(checkIns.status, "submitted"),
        isNotNull(checkIns.submittedAt),
      ),
    )
    .orderBy(asc(checkIns.submittedAt));
  return hydrateEntries(rows, viewerId);
}

export type MyCheckIn = {
  id: string;
  status: "draft" | "submitted";
  hasContent: boolean;
  updatedAt: Date;
} | null;

// The viewer's check-in for their own local "today" (drafts included).
export async function getMyCheckIn(teamId: string, dateISO: string, userId: string): Promise<MyCheckIn> {
  const [row] = await db
    .select({
      id: checkIns.id,
      status: checkIns.status,
      yesterday: checkIns.yesterday,
      today: checkIns.today,
      blockers: checkIns.blockers,
      updatedAt: checkIns.updatedAt,
    })
    .from(checkIns)
    .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
    .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
    .where(and(eq(schedules.teamId, teamId), eq(occurrences.scheduleDate, dateISO), eq(checkIns.userId, userId)))
    .orderBy(desc(checkIns.updatedAt))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    updatedAt: row.updatedAt,
    hasContent: !!(row.yesterday.trim() || row.today.trim() || row.blockers.trim()),
  };
}

// ────────── Away ──────────

export type AwayPeriod = { id: string; userId: string; startsOn: string; endsOn: string; note: string | null };

// Away periods that haven't ended yet (in anyone's calendar).
export async function getAwayPeriods(teamId: string, now = new Date()): Promise<AwayPeriod[]> {
  const earliest = new Date(now.getTime() - 26 * 3600 * 1000).toISOString().slice(0, 10);
  return db
    .select({
      id: memberAway.id,
      userId: memberAway.userId,
      startsOn: memberAway.startsOn,
      endsOn: memberAway.endsOn,
      note: memberAway.note,
    })
    .from(memberAway)
    .where(and(eq(memberAway.teamId, teamId), gte(memberAway.endsOn, earliest)))
    .orderBy(asc(memberAway.startsOn));
}

// Is the member away on their own local today?
export function awayToday(periods: AwayPeriod[], userId: string, tz: string, now = new Date()): AwayPeriod | null {
  const today = localDate(now, tz);
  return periods.find((p) => p.userId === userId && p.startsOn <= today && p.endsOn >= today) ?? null;
}

// ────────── Single check-in ──────────

export type CommentRow = {
  reactions: ReactionSummary[];
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  body: string;
  createdAt: Date;
  deleted: boolean;
};

export async function getCheckInDetail(teamId: string, checkInId: string, viewerId: string) {
  const [row] = await db
    .select({ ...entryColumns, scheduleDate: occurrences.scheduleDate })
    .from(checkIns)
    .innerJoin(users, eq(users.id, checkIns.userId))
    .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
    .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
    .where(and(eq(checkIns.id, checkInId), eq(schedules.teamId, teamId), eq(checkIns.status, "submitted")));
  if (!row) return null;
  const { scheduleDate, ...entryRow } = row;
  const [[entry], comments, reactions] = await Promise.all([
    hydrateEntries([entryRow], viewerId),
    db
      .select({
        id: checkInComments.id,
        userId: checkInComments.userId,
        userName: users.name,
        userEmail: users.email,
        body: checkInComments.body,
        createdAt: checkInComments.createdAt,
        deletedAt: checkInComments.deletedAt,
      })
      .from(checkInComments)
      .innerJoin(users, eq(users.id, checkInComments.userId))
      .where(eq(checkInComments.checkInId, checkInId))
      .orderBy(asc(checkInComments.createdAt)),
    loadReactions([checkInId], viewerId),
  ]);
  return {
    entry,
    scheduleDate,
    comments: comments.map(({ deletedAt, ...c }) => ({
      ...c,
      body: deletedAt ? "" : c.body,
      deleted: deletedAt !== null,
      reactions: deletedAt ? [] : (reactions.onComments.get(c.id) ?? []),
    })) satisfies CommentRow[],
  };
}

// Comments on the viewer's check-ins from others since `since`.
export async function getRepliesToMe(teamId: string, userId: string, since: Date) {
  return db
    .select({
      commentId: checkInComments.id,
      checkInId: checkInComments.checkInId,
      authorName: users.name,
      authorEmail: users.email,
      body: checkInComments.body,
      createdAt: checkInComments.createdAt,
    })
    .from(checkInComments)
    .innerJoin(checkIns, eq(checkIns.id, checkInComments.checkInId))
    .innerJoin(users, eq(users.id, checkInComments.userId))
    .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
    .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
    .where(
      and(
        eq(schedules.teamId, teamId),
        eq(checkIns.userId, userId),
        sql`${checkInComments.userId} <> ${userId}`,
        isNull(checkInComments.deletedAt),
        gte(checkInComments.createdAt, since),
        lte(checkInComments.createdAt, new Date()),
      ),
    )
    .orderBy(desc(checkInComments.createdAt))
    .limit(5);
}
