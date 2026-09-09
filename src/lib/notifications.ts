import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
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
import { extractMentions } from "@/lib/mentions";

type Enqueue = {
  userId: string;
  teamId: string;
  type: "mentioned" | "blocker_on_your_item" | "window_open" | "digest_ready";
  title: string;
  body?: string;
  linkPath?: string;
  data?: Record<string, unknown>;
  sendEmail?: boolean;
};

// Create a notification + optionally send an email. All fields flow through
// the admin db (this is server-only) since these are peer-triggered writes.
export async function notify(input: Enqueue): Promise<void> {
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
    .returning();

  if (input.sendEmail === false) return;

  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, input.userId));
  if (!u) return;
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${input.linkPath ?? "/"}`;
  const body = `${input.body ?? ""}\n\n${url}\n\n— Asincly`.trim();
  try {
    await sendEmail({
      to: u.email,
      subject: input.title,
      text: body,
    });
    await db
      .update(notifications)
      .set({ emailSentAt: new Date() })
      .where(eq(notifications.id, inserted.id));
  } catch (e) {
    console.error("[notify:email]", e);
  }
}

// Fire notifications for people mentioned in a submitted check-in.
// Blocker mentions get a stronger `blocker_on_your_item` type.
export async function fireMentionEvents(checkInId: string): Promise<void> {
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

  const author = ctx.authorName ?? ctx.authorEmail;
  const linkPath = `/${ctx.orgSlug}/${ctx.teamSlug}`;

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

  for (const m of combined) {
    if (m.userId === ctx.authorId) continue;
    if (!teamMemberIds.has(m.userId)) continue;

    if (m.source === "blockers") {
      if (seenBlocker.has(m.userId)) continue;
      seenBlocker.add(m.userId);
      await notify({
        userId: m.userId,
        teamId: ctx.teamId,
        type: "blocker_on_your_item",
        title: `${author} is blocked on you`,
        body: `In ${ctx.teamName}'s standup. Take a look when you get a chance.`,
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
        body: `In ${ctx.teamName}'s standup for today.`,
        linkPath,
        data: { checkInId, authorId: ctx.authorId },
      });
    }
  }
}

export async function listRecentForUser(userId: string, limit = 20) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(userId: string) {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows.length;
}

export async function markAllReadForUser(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
