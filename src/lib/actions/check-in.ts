"use server";

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser, type Q } from "@/db/with-user";
import { checkIns, members, occurrences, recordings, schedules, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { carryOver } from "@/lib/carry-over";
import { authorCheckIn } from "@/lib/check-in-access";
import { extractMentions, linkAtMentions } from "@/lib/mentions";
import { fireMentionEvents } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
import { localDate, nextOccurrenceDate, occursOn } from "@/lib/time";
import { VideoSkipSchema } from "@/lib/validation/social";

// Ids arrive from the browser like any other input.
const Id = z.string().uuid();

// Get (or lazily create) today's occurrence for the primary active schedule
// of `teamId`, computed in the *caller's* tz. Returns the occurrence id +
// their existing check-in row if any (also lazily created as a draft).
//
// On a day the schedule's RRULE doesn't cover, creates nothing and reports
// `offDay`. Creating an occurrence there would put a day nobody was asked
// about into the feed and make the digest chase absent check-ins.
export async function getOrCreateTodayContext(teamId: string, scheduleId?: string) {
  teamId = Id.parse(teamId);
  scheduleId = Id.optional().parse(scheduleId);
  const user = await requireUser();
  return withUser(user.id, async (tx) => {
    const [membership] = await tx
      .select({ id: members.id, role: members.role })
      .from(members)
      .where(and(eq(members.teamId, teamId), eq(members.userId, user.id)));
    if (!membership) throw new Error("Not a member of this team");
    if (membership.role === "guest") throw new Error("Guests read along but don't check in");

    const active = await tx
      .select()
      .from(schedules)
      .where(and(eq(schedules.teamId, teamId), eq(schedules.active, true)));
    const primary = (scheduleId && active.find((s) => s.id === scheduleId)) || active[0];
    if (!primary) throw new Error("No active schedule for this team");

    const now = new Date();
    const today = localDate(now, user.tz);

    if (!occursOn(primary.rrule, today)) {
      return {
        offDay: true as const,
        scheduleId: primary.id,
        localDate: today,
        nextDate: nextOccurrenceDate(primary.rrule, now, user.tz),
      };
    }

    // Occurrence for (scheduleId, today): insert, or read the one a teammate
    // (or the cron) already made.
    const [inserted] = await tx
      .insert(occurrences)
      .values({ scheduleId: primary.id, scheduleDate: today })
      .onConflictDoNothing({ target: [occurrences.scheduleId, occurrences.scheduleDate] })
      .returning();
    const occ =
      inserted ??
      (
        await tx
          .select()
          .from(occurrences)
          .where(and(eq(occurrences.scheduleId, primary.id), eq(occurrences.scheduleDate, today)))
      )[0];

    // Get or create the caller's draft check-in for this occurrence.
    const [existing] = await tx
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.occurrenceId, occ.id), eq(checkIns.userId, user.id)));

    let ci = existing;
    if (!ci) {
      // Fresh draft: carry unchecked items forward from the caller's most
      // recent submitted check-in on this team.
      const seed = await computeCarryOverSeed(tx, user.id, teamId, occ.id);
      ci = (
        await tx
          .insert(checkIns)
          .values({
            occurrenceId: occ.id,
            userId: user.id,
            localDate: today,
            yesterday: seed.yesterday,
            today: seed.today,
          })
          .returning()
      )[0];
    }

    return { offDay: false as const, occurrenceId: occ.id, checkIn: ci, scheduleId: primary.id, localDate: today };
  });
}

async function computeCarryOverSeed(q: Q, userId: string, teamId: string, notOccId: string) {
  // Find the caller's most recent submitted check-in in this team,
  // excluding the current occurrence.
  const [prev] = await q
    .select({ today: checkIns.today })
    .from(checkIns)
    .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
    .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
    .where(
      and(
        eq(checkIns.userId, userId),
        eq(schedules.teamId, teamId),
        eq(checkIns.status, "submitted"),
        ne(checkIns.occurrenceId, notOccId),
      ),
    )
    .orderBy(desc(checkIns.submittedAt))
    .limit(1);
  if (!prev) return { yesterday: "", today: "" };
  return carryOver(prev.today);
}

const DraftSchema = z.object({
  checkInId: z.string().uuid(),
  yesterday: z.string().max(20000).optional(),
  today: z.string().max(20000).optional(),
  blockers: z.string().max(20000).optional(),
});

export async function saveCheckInDraft(input: unknown) {
  const user = await requireUser();
  const parsed = DraftSchema.parse(input);

  // Editing a submitted check-in is allowed too.
  if (!(await authorCheckIn(parsed.checkInId, user.id))) throw new Error("Not your check-in");

  const patch: Partial<typeof checkIns.$inferInsert> = { updatedAt: new Date() };
  if (parsed.yesterday !== undefined) patch.yesterday = parsed.yesterday;
  if (parsed.today !== undefined) patch.today = parsed.today;
  if (parsed.blockers !== undefined) patch.blockers = parsed.blockers;

  await withUser(user.id, (tx) => tx.update(checkIns).set(patch).where(eq(checkIns.id, parsed.checkInId)));
  return { savedAt: new Date().toISOString() };
}

export type SubmitResult =
  | { ok: true; orgSlug: string; teamSlug: string; checkInId: string }
  | { ok: false; error: string };

const SubmitSchema = z.object({
  checkInId: z.string().uuid(),
  yesterday: z.string().max(20000),
  today: z.string().max(20000),
  blockers: z.string().max(20000),
  // Only meaningful when the team requires video and there is no recording.
  videoSkip: VideoSkipSchema.optional(),
});

const mentionIds = (...mds: string[]) => new Set(mds.flatMap((md) => extractMentions(md).map((m) => m.userId)));

// Returns instead of redirecting so the flow can play its "sent" moment
// before navigating.
export async function submitCheckIn(input: unknown): Promise<SubmitResult> {
  try {
    const user = await requireUser();
    const parsed = SubmitSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "That check-in is too long to send." };
    const { checkInId, videoSkip } = parsed.data;

    const ctx = await authorCheckIn(checkInId, user.id);
    if (!ctx) return { ok: false, error: "Not your check-in" };
    const ci = ctx.ci;

    // A typed "@anton" becomes a real mention (and a notification) when it
    // names exactly one teammate; the picker isn't the only way to tag.
    const roster = await withUser(user.id, (tx) =>
      tx
        .select({ userId: users.id, name: users.name, email: users.email })
        .from(members)
        .innerJoin(users, eq(users.id, members.userId))
        .where(eq(members.teamId, ctx.teamId)),
    );
    const [yesterday, today, blockers] = [parsed.data.yesterday, parsed.data.today, parsed.data.blockers].map((md) =>
      linkAtMentions(md, roster),
    );

    // Mandatory video: a recording, or a stated reason for skipping it.
    const [recording] = await withUser(user.id, (tx) =>
      tx
        .select({ id: recordings.id, drafted: sql<boolean>`${recordings.draftCipher} <> ''` })
        .from(recordings)
        .where(eq(recordings.checkInId, checkInId))
        .limit(1),
    );
    if (ctx.requireVideo && !recording && !videoSkip && !ci.videoSkipReason) {
      return { ok: false, error: "Your team asks for a video. Record one, or tell them why you can't today." };
    }
    const skip = !recording && videoSkip ? videoSkip : null;

    const firstSend = ci.status !== "submitted";
    const newMentions = firstSend
      ? null
      : [...mentionIds(yesterday, today, blockers)].filter((id) => !mentionIds(ci.yesterday, ci.today, ci.blockers).has(id));
    await withUser(user.id, (tx) =>
      tx
        .update(checkIns)
        .set({
          yesterday,
          today,
          blockers,
          ...(skip ? { videoSkipReason: skip.reason, videoSkipNote: skip.note } : {}),
        // Started from an AI draft of the recording; shown to readers.
        aiAssisted: !!recording?.drafted,
          status: "submitted",
          // Keep the original send time on edits so the feed order is stable.
          submittedAt: ci.submittedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(checkIns.id, checkInId)),
    );

    await audit({
      orgId: ctx.orgId,
      actorUserId: user.id,
      action: firstSend ? "check_in.submit" : "check_in.update",
      resourceType: "check_in",
      resourceId: checkInId,
    });

    if (skip) {
      await audit({
        orgId: ctx.orgId,
        actorUserId: user.id,
        action: "check_in.video_skipped",
        resourceType: "check_in",
        resourceId: checkInId,
        meta: { reason: skip.reason },
      });
    }

    revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}`, "layout");

    // Notify people named in the check-in: everyone on first send, and only
    // newly added names when an already-sent check-in is updated.
    if (firstSend || (newMentions && newMentions.length > 0)) {
      void fireMentionEvents(checkInId, newMentions ?? undefined).catch((e) =>
        console.error("[fireMentionEvents]", e instanceof Error ? e.message : "failed"),
      );
    }
    return { ok: true, orgSlug: ctx.orgSlug, teamSlug: ctx.teamSlug, checkInId };
  } catch (e) {
    console.error("[submitCheckIn]", e instanceof Error ? e.message : "unknown error");
    return { ok: false, error: "Couldn't send — your draft is saved. Try again." };
  }
}

// Takes a sent check-in back to draft, out of teammates' feeds.
export async function reopenCheckIn(checkInId: string) {
  checkInId = Id.parse(checkInId);
  const user = await requireUser();
  const id = z.string().uuid().parse(checkInId);
  const ctx = await authorCheckIn(id, user.id);
  if (!ctx) throw new Error("Not your check-in");
  await withUser(user.id, (tx) =>
    tx
      .update(checkIns)
      .set({ status: "draft", submittedAt: null, updatedAt: new Date() })
      .where(eq(checkIns.id, id)),
  );
  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "check_in.reopen",
    resourceType: "check_in",
    resourceId: id,
  });
}
