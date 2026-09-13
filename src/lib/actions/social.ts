"use server";

import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  blockerActions,
  checkInComments,
  checkInReactions,
  checkIns,
  memberAway,
  members,
  notifications,
  occurrences,
  organizations,
  schedules,
  teams,
  users,
} from "@/db/schema";
import { withUser } from "@/db/with-user";
import { audit } from "@/lib/audit";
import { displayName, firstName } from "@/lib/display";
import { blockerItems, plainText } from "@/lib/note-items";
import { notify } from "@/lib/notifications";
import { checkInDetailPath, checkInFlowPath, teamPath } from "@/lib/paths";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import {
  AddCommentSchema,
  BlockerActionSchema,
  ClearAwaySchema,
  DeleteCommentSchema,
  NudgeSchema,
  SetAwaySchema,
  ToggleReactionSchema,
  type ActionResult,
} from "@/lib/validation/social";

// All writes here go through withUser() so Postgres RLS (0013_social_rls)
// is the last line of defence, not just these checks. Notifications and
// audit rows use the trusted server client, like the rest of the app.

const fail = (error: string): ActionResult => ({ ok: false, error });

function firstIssue(e: { issues: Array<{ message: string }> }): string {
  return e.issues[0]?.message ?? "Invalid input";
}

// Team + author context for a check-in the caller can see. `null` means the
// check-in doesn't exist or the caller isn't on its team.
async function checkInContext(checkInId: string, userId: string) {
  const [ctx] = await db
    .select({
      checkInId: checkIns.id,
      authorId: checkIns.userId,
      authorName: users.name,
      authorEmail: users.email,
      blockers: checkIns.blockers,
      status: checkIns.status,
      teamId: teams.id,
      teamName: teams.name,
      teamSlug: teams.slug,
      orgId: organizations.id,
      orgSlug: organizations.slug,
    })
    .from(checkIns)
    .innerJoin(users, eq(users.id, checkIns.userId))
    .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
    .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
    .innerJoin(teams, eq(teams.id, schedules.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(eq(checkIns.id, checkInId));
  if (!ctx || ctx.status !== "submitted") return null;
  const [m] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.teamId, ctx.teamId), eq(members.userId, userId)));
  return m ? ctx : null;
}

async function actorName(userId: string): Promise<string> {
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId));
  return u ? displayName(u.name, u.email) : "A teammate";
}

function revalidateTeam(orgSlug: string, teamSlug: string, checkInId?: string) {
  revalidatePath(teamPath(orgSlug, teamSlug));
  if (checkInId) revalidatePath(checkInDetailPath(orgSlug, teamSlug, checkInId));
}

// ────────── Reactions ──────────

export async function toggleReaction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ToggleReactionSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { checkInId, commentId, emoji } = parsed.data;

  if (!rateLimit(`reaction:${user.id}`, 60, 60_000).allowed) return fail("Slow down a little");
  const ctx = await checkInContext(checkInId, user.id);
  if (!ctx) return fail("Check-in not found");
  if (commentId) {
    const [c] = await db
      .select({ checkInId: checkInComments.checkInId, deletedAt: checkInComments.deletedAt })
      .from(checkInComments)
      .where(eq(checkInComments.id, commentId));
    if (!c || c.checkInId !== checkInId || c.deletedAt) return fail("Reply not found");
  }

  const added = await withUser(user.id, async (tx) => {
    const removed = await tx
      .delete(checkInReactions)
      .where(
        and(
          eq(checkInReactions.checkInId, checkInId),
          commentId ? eq(checkInReactions.commentId, commentId) : isNull(checkInReactions.commentId),
          eq(checkInReactions.userId, user.id),
          eq(checkInReactions.emoji, emoji),
        ),
      )
      .returning({ id: checkInReactions.id });
    if (removed.length > 0) return false;
    // Cap distinct emoji per target so a thread can't be flooded.
    const distinct = await tx
      .selectDistinct({ emoji: checkInReactions.emoji })
      .from(checkInReactions)
      .where(
        and(
          eq(checkInReactions.checkInId, checkInId),
          commentId ? eq(checkInReactions.commentId, commentId) : isNull(checkInReactions.commentId),
        ),
      );
    if (distinct.length >= 24 && !distinct.some((d) => d.emoji === emoji)) return null;
    await tx.insert(checkInReactions).values({ checkInId, commentId: commentId ?? null, userId: user.id, emoji });
    return true;
  });
  if (added === null) return fail("That's plenty of reactions already");

  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: added ? "reaction.add" : "reaction.remove",
    resourceType: commentId ? "check_in_comment" : "check_in",
    resourceId: commentId ?? checkInId,
    meta: { emoji },
  });
  revalidateTeam(ctx.orgSlug, ctx.teamSlug, checkInId);
  return { ok: true };
}

// ────────── Comments ──────────

export async function addComment(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = AddCommentSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { checkInId, body } = parsed.data;

  if (!rateLimit(`comment:${user.id}`, 20, 60_000).allowed) {
    return fail("That's a lot of comments — try again in a minute");
  }
  const ctx = await checkInContext(checkInId, user.id);
  if (!ctx) return fail("Check-in not found");

  const [row] = await withUser(user.id, (tx) =>
    tx.insert(checkInComments).values({ checkInId, userId: user.id, body }).returning({ id: checkInComments.id }),
  );

  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "comment.create",
    resourceType: "check_in_comment",
    resourceId: row.id,
    meta: { checkInId },
  });

  if (ctx.authorId !== user.id) {
    const who = await actorName(user.id);
    await notify({
      userId: ctx.authorId,
      teamId: ctx.teamId,
      type: "commented",
      title: `${who} replied to your check-in`,
      body: plainText(body).slice(0, 140),
      linkPath: checkInDetailPath(ctx.orgSlug, ctx.teamSlug, checkInId),
      data: { checkInId, commentId: row.id, actorId: user.id },
      sendEmail: false,
    });
  }
  revalidateTeam(ctx.orgSlug, ctx.teamSlug, checkInId);
  return { ok: true };
}

export async function deleteComment(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = DeleteCommentSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const [comment] = await db
    .select({ id: checkInComments.id, checkInId: checkInComments.checkInId, userId: checkInComments.userId })
    .from(checkInComments)
    .where(eq(checkInComments.id, parsed.data.commentId));
  if (!comment || comment.userId !== user.id) return fail("You can only remove your own comments");
  const ctx = await checkInContext(comment.checkInId, user.id);
  if (!ctx) return fail("Check-in not found");

  // Soft delete: keep the row so the thread shape survives, drop the text.
  const updated = await withUser(user.id, (tx) =>
    tx
      .update(checkInComments)
      .set({ deletedAt: new Date(), body: "·" })
      .where(eq(checkInComments.id, comment.id))
      .returning({ id: checkInComments.id }),
  );
  if (updated.length === 0) return fail("You can only remove your own comments");

  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "comment.delete",
    resourceType: "check_in_comment",
    resourceId: comment.id,
  });
  revalidateTeam(ctx.orgSlug, ctx.teamSlug, comment.checkInId);
  return { ok: true };
}

// ────────── Blockers ──────────

async function blockerContext(input: unknown, userId: string) {
  const parsed = BlockerActionSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) } as const;
  const ctx = await checkInContext(parsed.data.checkInId, userId);
  if (!ctx) return { error: "Check-in not found" } as const;
  const item = blockerItems(ctx.blockers).find((b) => b.key === parsed.data.itemKey);
  if (!item) return { error: "That blocker was edited or removed" } as const;
  return { ctx, item, itemKey: parsed.data.itemKey } as const;
}

// Toggle "I can help" on someone else's blocker.
export async function toggleHelp(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const b = await blockerContext(input, user.id);
  if ("error" in b) return fail(b.error ?? "Invalid input");
  const { ctx, item, itemKey } = b;
  if (ctx.authorId === user.id) return fail("That's your own blocker");
  if (!rateLimit(`help:${user.id}`, 30, 60_000).allowed) return fail("Slow down a little");

  const added = await withUser(user.id, async (tx) => {
    const removed = await tx
      .delete(blockerActions)
      .where(
        and(
          eq(blockerActions.checkInId, ctx.checkInId),
          eq(blockerActions.itemKey, itemKey),
          eq(blockerActions.userId, user.id),
          eq(blockerActions.kind, "help"),
        ),
      )
      .returning({ id: blockerActions.id });
    if (removed.length > 0) return false;
    await tx.insert(blockerActions).values({ checkInId: ctx.checkInId, itemKey, userId: user.id, kind: "help" });
    return true;
  });

  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: added ? "blocker.help" : "blocker.help_withdraw",
    resourceType: "check_in",
    resourceId: ctx.checkInId,
    meta: { itemKey },
  });

  if (added) {
    const who = await actorName(user.id);
    await notify({
      userId: ctx.authorId,
      teamId: ctx.teamId,
      type: "help_offered",
      title: `${who} can help with your blocker`,
      body: plainText(item.text).slice(0, 140),
      linkPath: checkInDetailPath(ctx.orgSlug, ctx.teamSlug, ctx.checkInId),
      data: { checkInId: ctx.checkInId, itemKey, actorId: user.id },
    });
  }
  revalidateTeam(ctx.orgSlug, ctx.teamSlug, ctx.checkInId);
  return { ok: true };
}

// Author toggles their own blocker resolved; helpers hear about it.
export async function toggleResolved(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const b = await blockerContext(input, user.id);
  if ("error" in b) return fail(b.error ?? "Invalid input");
  const { ctx, item, itemKey } = b;
  if (ctx.authorId !== user.id) return fail("Only the author can resolve a blocker");

  const { resolved, helperIds } = await withUser(user.id, async (tx) => {
    const removed = await tx
      .delete(blockerActions)
      .where(
        and(
          eq(blockerActions.checkInId, ctx.checkInId),
          eq(blockerActions.itemKey, itemKey),
          eq(blockerActions.userId, user.id),
          eq(blockerActions.kind, "resolved"),
        ),
      )
      .returning({ id: blockerActions.id });
    if (removed.length > 0) return { resolved: false, helperIds: [] as string[] };
    await tx.insert(blockerActions).values({ checkInId: ctx.checkInId, itemKey, userId: user.id, kind: "resolved" });
    const helpers = await tx
      .select({ userId: blockerActions.userId })
      .from(blockerActions)
      .where(
        and(
          eq(blockerActions.checkInId, ctx.checkInId),
          eq(blockerActions.itemKey, itemKey),
          eq(blockerActions.kind, "help"),
        ),
      );
    return { resolved: true, helperIds: helpers.map((h) => h.userId) };
  });

  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: resolved ? "blocker.resolve" : "blocker.reopen",
    resourceType: "check_in",
    resourceId: ctx.checkInId,
    meta: { itemKey },
  });

  const author = firstName(ctx.authorName, ctx.authorEmail);
  for (const helperId of helperIds) {
    await notify({
      userId: helperId,
      teamId: ctx.teamId,
      type: "blocker_resolved",
      title: `${author}'s blocker is resolved`,
      body: `Thanks for offering to help: ${plainText(item.text).slice(0, 120)}`,
      linkPath: checkInDetailPath(ctx.orgSlug, ctx.teamSlug, ctx.checkInId),
      data: { checkInId: ctx.checkInId, itemKey, actorId: user.id },
      sendEmail: false,
    });
  }
  revalidateTeam(ctx.orgSlug, ctx.teamSlug, ctx.checkInId);
  return { ok: true };
}

// ────────── Away ──────────

async function teamContext(teamId: string, userId: string) {
  const [row] = await db
    .select({
      orgId: teams.orgId,
      orgSlug: organizations.slug,
      teamSlug: teams.slug,
      teamName: teams.name,
      role: members.role,
    })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(and(eq(members.teamId, teamId), eq(members.userId, userId)));
  return row ?? null;
}

export async function setAway(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = SetAwaySchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { teamId, startsOn, endsOn, note } = parsed.data;
  const ctx = await teamContext(teamId, user.id);
  if (!ctx) return fail("Team not found");
  if (ctx.role === "guest") return fail("Guests don't have check-in availability");

  const [row] = await withUser(user.id, async (tx) => {
    // One active period at a time: replace any that overlap.
    await tx
      .delete(memberAway)
      .where(
        and(
          eq(memberAway.teamId, teamId),
          eq(memberAway.userId, user.id),
          sql`${memberAway.startsOn} <= ${endsOn} AND ${memberAway.endsOn} >= ${startsOn}`,
        ),
      );
    return tx
      .insert(memberAway)
      .values({ teamId, userId: user.id, startsOn, endsOn, note })
      .returning({ id: memberAway.id });
  });

  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "away.set",
    resourceType: "member_away",
    resourceId: row.id,
    meta: { teamId, startsOn, endsOn },
  });
  revalidatePath(teamPath(ctx.orgSlug, ctx.teamSlug), "layout");
  return { ok: true };
}

export async function clearAway(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ClearAwaySchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const deleted = await withUser(user.id, (tx) =>
    tx
      .delete(memberAway)
      .where(and(eq(memberAway.id, parsed.data.awayId), eq(memberAway.userId, user.id)))
      .returning({ teamId: memberAway.teamId }),
  );
  if (deleted.length === 0) return fail("Nothing to clear");
  const ctx = await teamContext(deleted[0].teamId, user.id);
  if (ctx) {
    await audit({
      orgId: ctx.orgId,
      actorUserId: user.id,
      action: "away.clear",
      resourceType: "member_away",
      resourceId: parsed.data.awayId,
    });
    revalidatePath(teamPath(ctx.orgSlug, ctx.teamSlug), "layout");
  }
  return { ok: true };
}

// ────────── Nudge ──────────

const NUDGE_COOLDOWN_MS = 20 * 60 * 60 * 1000;

export async function nudge(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = NudgeSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { teamId, userId: targetId } = parsed.data;
  if (targetId === user.id) return fail("You can't nudge yourself");
  if (!rateLimit(`nudge:${user.id}`, 10, 60 * 60_000).allowed) return fail("Too many nudges — try later");

  const ctx = await teamContext(teamId, user.id);
  if (!ctx) return fail("Team not found");
  if (ctx.role === "guest") return fail("Guests can't nudge");
  const targetOnTeam = await withUser(user.id, (tx) =>
    tx
      .select({ id: members.id, role: members.role })
      .from(members)
      .where(and(eq(members.teamId, teamId), eq(members.userId, targetId))),
  );
  if (targetOnTeam.length === 0 || targetOnTeam[0].role === "guest") return fail("Not on this team");

  // One nudge per pair per day.
  const recent = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, targetId),
        eq(notifications.teamId, teamId),
        inArray(notifications.type, ["nudged"]),
        gt(notifications.createdAt, new Date(Date.now() - NUDGE_COOLDOWN_MS)),
        sql`${notifications.data} ->> 'actorId' = ${user.id}`,
      ),
    )
    .limit(1);
  if (recent.length > 0) return fail("Already nudged today");

  const who = await actorName(user.id);
  await notify({
    userId: targetId,
    teamId,
    type: "nudged",
    title: `${who} is looking forward to your check-in`,
    body: `${ctx.teamName} · your window is open.`,
    linkPath: checkInFlowPath(ctx.orgSlug, ctx.teamSlug),
    data: { actorId: user.id },
  });
  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "member.nudge",
    resourceType: "user",
    resourceId: targetId,
    meta: { teamId },
  });
  revalidatePath(teamPath(ctx.orgSlug, ctx.teamSlug));
  return { ok: true };
}
