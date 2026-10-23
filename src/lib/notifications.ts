import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { withUser } from "@/db/with-user";
import {
  checkInComments,
  checkInReactions,
  checkIns,
  members,
  notifications,
  occurrences,
  organizations,
  schedules,
  teams,
  users,
} from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { EMAIL_KIND_LABEL, emailKindFor, unsubscribeUrl } from "@/lib/email-prefs";
import { extractMentions } from "@/lib/mentions";
import { displayName } from "@/lib/display";
import { checkInDetailPath } from "@/lib/paths";
import { reactionNotice } from "@/lib/reaction-notice";

type Enqueue = {
  userId: string;
  teamId: string;
  type: (typeof notifications.$inferInsert)["type"];
  title: string;
  body?: string;
  linkPath?: string;
  data?: Record<string, unknown>;
  sendEmail?: boolean;
};

const ACTION_LABEL: Record<Enqueue["type"], string> = {
  window_open: "Check in",
  digest_ready: "Read the digest",
  mentioned: "Open the check-in",
  blocker_on_your_item: "See the blocker",
  commented: "Read the reply",
  help_offered: "See the offer",
  blocker_resolved: "Open the check-in",
  nudged: "Check in",
  reacted: "Open the check-in",
};

// Create a notification + optionally send an email. False when it already
// existed (see notification_once_per_occurrence_uq). All fields flow through
// the admin db (this is server-only) since these are peer-triggered writes.
export async function notify(input: Enqueue): Promise<boolean> {
  const [inserted] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      teamId: input.teamId,
      type: input.type,
      title: input.title,
      body: input.body,
      linkPath: input.linkPath,
      data: input.data,
    })
    // A reminder or digest already sent for this occurrence (two cron runs
    // overlapping) is a no-op, email and all.
    .onConflictDoNothing()
    .returning();
  if (!inserted) return false;

  if (input.sendEmail === false) return true;

  const [u] = await db
    .select({ email: users.email, reminders: users.emailReminders, activity: users.emailActivity })
    .from(users)
    .where(eq(users.id, input.userId));
  if (!u) return true;
  const kind = emailKindFor(input.type);
  if (!u[kind]) return true;
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${input.linkPath ?? "/"}`;
  try {
    await sendEmail({
      to: u.email,
      subject: input.title,
      text: input.body ?? "",
      action: { label: ACTION_LABEL[input.type], url },
      unsubscribe: { url: unsubscribeUrl(input.userId, kind), what: EMAIL_KIND_LABEL[kind] },
    });
    await db
      .update(notifications)
      .set({ emailSentAt: new Date() })
      .where(eq(notifications.id, inserted.id));
  } catch (e) {
    // Message only: SDK errors can carry the serialized request, email text included.
    console.error("[notify:email]", e instanceof Error ? e.message : "unknown error");
  }
  return true;
}

// Fire notifications for people mentioned in a submitted check-in.
// Blocker mentions get a stronger `blocker_on_your_item` type.
export async function fireMentionEvents(checkInId: string, onlyUserIds?: string[]): Promise<void> {
  const [ctx] = await db
    .select({
      authorId: checkIns.userId,
      authorName: users.name,
      authorEmail: users.email,
      yesterday: checkIns.yesterday,
      today: checkIns.today,
      blockers: checkIns.blockers,
      teamId: schedules.teamId,
      teamName: teams.name,
      teamSlug: teams.slug,
      orgSlug: organizations.slug,
    })
    .from(checkIns)
    .innerJoin(users, eq(users.id, checkIns.userId))
    .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
    .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
    .innerJoin(teams, eq(teams.id, schedules.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(eq(checkIns.id, checkInId));
  if (!ctx) return;

  const author = ctx.authorName?.trim() || ctx.authorEmail.split("@")[0];
  const linkPath = checkInDetailPath(ctx.orgSlug, ctx.teamSlug, checkInId);

  const yMentions = extractMentions(ctx.yesterday).map((m) => ({ ...m, source: "yesterday" as const }));
  const tMentions = extractMentions(ctx.today).map((m) => ({ ...m, source: "today" as const }));
  const bMentions = extractMentions(ctx.blockers).map((m) => ({ ...m, source: "blockers" as const }));

  const combined = [...yMentions, ...tMentions, ...bMentions];
  if (combined.length === 0) return;

  // Verify mentioned users are actually team members (RLS would also block,
  // but a friendly filter avoids junk rows).
  const teamMemberIds = new Set(
    (
      await db
        .select({ userId: members.userId })
        .from(members)
        .where(eq(members.teamId, ctx.teamId))
    ).map((m) => m.userId),
  );

  // Dedupe by (userId, source-classification)
  const seenMention = new Set<string>();
  const seenBlocker = new Set<string>();

  const only = onlyUserIds ? new Set(onlyUserIds) : null;
  for (const m of combined) {
    if (m.userId === ctx.authorId) continue;
    if (only && !only.has(m.userId)) continue;
    if (!teamMemberIds.has(m.userId)) continue;

    if (m.source === "blockers") {
      if (seenBlocker.has(m.userId)) continue;
      seenBlocker.add(m.userId);
      await notify({
        userId: m.userId,
        teamId: ctx.teamId,
        type: "blocker_on_your_item",
        title: `${author} is blocked on you`,
        body: `In ${ctx.teamName}'s check-in. Take a look when you get a chance.`,
        linkPath,
        data: { checkInId, authorId: ctx.authorId },
      });
    } else {
      if (seenMention.has(m.userId)) continue;
      seenMention.add(m.userId);
      await notify({
        userId: m.userId,
        teamId: ctx.teamId,
        type: "mentioned",
        title: `${author} mentioned you`,
        body: `In ${ctx.teamName}'s check-in for today.`,
        linkPath,
        data: { checkInId, authorId: ctx.authorId },
      });
    }
  }
}

// The viewer's own inbox, read and updated as them (RLS: own rows only).
export async function listRecentForUser(userId: string, limit = 20) {
  return withUser(userId, (tx) =>
    tx
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
  );
}

export async function unreadCount(userId: string) {
  const rows = await withUser(userId, (tx) =>
    tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  );
  return rows.length;
}

export async function markAllReadForUser(userId: string) {
  await withUser(userId, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  );
}

export async function markReadForUser(userId: string, id: string) {
  await withUser(userId, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt))),
  );
}

// Reactions on one check-in (commentId null) or one reply share a single
// notification for its author, rewritten from the current reactions on every
// change. A new reaction brings it back to the top, unread; when the last
// one is taken back, it goes. In-app only: no email per emoji.
export async function syncReactionNotice(input: {
  checkInId: string;
  commentId: string | null;
  teamId: string;
  linkPath: string;
  added: boolean;
}): Promise<void> {
  const { checkInId, commentId } = input;
  const [owner] = commentId
    ? await db.select({ id: checkInComments.userId }).from(checkInComments).where(eq(checkInComments.id, commentId))
    : await db.select({ id: checkIns.userId }).from(checkIns).where(eq(checkIns.id, checkInId));
  if (!owner) return;

  const rows = await db
    .select({ userId: checkInReactions.userId, name: users.name, email: users.email, emoji: checkInReactions.emoji })
    .from(checkInReactions)
    .innerJoin(users, eq(users.id, checkInReactions.userId))
    .where(
      and(
        eq(checkInReactions.checkInId, checkInId),
        commentId ? eq(checkInReactions.commentId, commentId) : isNull(checkInReactions.commentId),
        ne(checkInReactions.userId, owner.id),
      ),
    )
    .orderBy(desc(checkInReactions.createdAt));

  const target = commentId ?? checkInId;
  const existing = and(
    eq(notifications.userId, owner.id),
    eq(notifications.type, "reacted"),
    sql`${notifications.data}->>'target' = ${target}`,
  );
  if (rows.length === 0) {
    await db.delete(notifications).where(existing);
    return;
  }

  const people = new Map<string, { name: string; emoji: string[] }>();
  for (const r of rows) {
    const p = people.get(r.userId) ?? { name: displayName(r.name, r.email), emoji: [] };
    p.emoji.push(r.emoji);
    people.set(r.userId, p);
  }
  const { title, body } = reactionNotice([...people.values()], !!commentId);

  // ponytail: read-then-write, so two reactions landing in the same instant
  // can make two rows; the next change rewrites one. A unique index on
  // (user_id, data->>'target') closes it if that ever shows up.
  const [row] = await db.select({ id: notifications.id }).from(notifications).where(existing).limit(1);
  if (row) {
    await db
      .update(notifications)
      .set({ title, body, ...(input.added ? { readAt: null, createdAt: new Date() } : {}) })
      .where(eq(notifications.id, row.id));
  } else if (input.added) {
    await db.insert(notifications).values({
      userId: owner.id,
      teamId: input.teamId,
      type: "reacted",
      title,
      body,
      linkPath: input.linkPath,
      data: { checkInId, commentId, target },
    });
  }
}
