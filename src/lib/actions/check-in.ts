"use server";

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { checkIns, members, occurrences, organizations, recordings, schedules, teams } from "@/db/schema";
import { audit } from "@/lib/audit";
import { carryOver } from "@/lib/carry-over";
import { extractMentions } from "@/lib/mentions";
import { fireMentionEvents } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
import { localDate } from "@/lib/time";
import { VideoSkipSchema } from "@/lib/validation/social";

// Get (or lazily create) today's occurrence for the primary active schedule
// of `teamId`, computed in the *caller's* tz. Returns the occurrence id +
// their existing check-in row if any (also lazily created as a draft).
export async function getOrCreateTodayContext(teamId: string, scheduleId?: string) {
  const user = await requireUser();

  // Membership check
  const [membership] = await db
    .select({ id: members.id, role: members.role })
    .from(members)
    .where(and(eq(members.teamId, teamId), eq(members.userId, user.id)));
  if (!membership) throw new Error("Not a member of this team");
  if (membership.role === "guest") throw new Error("Guests read along but don't check in");

  const active = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.teamId, teamId), eq(schedules.active, true)));
  const primary =
    (scheduleId && active.find((s) => s.id === scheduleId)) || active[0];
  if (!primary) throw new Error("No active schedule for this team");

  const today = localDate(new Date(), user.tz);

  // Upsert occurrence for (scheduleId, today).
  const [occ] = await db
    .insert(occurrences)
    .values({ scheduleId: primary.id, scheduleDate: today })
    .onConflictDoUpdate({
      target: [occurrences.scheduleId, occurrences.scheduleDate],
      set: { scheduleId: sql`${occurrences.scheduleId}` }, // no-op just to force return
    })
    .returning();

  // Get or create the caller's draft check-in for this occurrence.
  const [existing] = await db
    .select()
    .from(checkIns)
    .where(and(eq(checkIns.occurrenceId, occ.id), eq(checkIns.userId, user.id)));

  let ci = existing;
  if (!ci) {
    // Fresh draft: carry unchecked items forward from the caller's most
    // recent submitted check-in on this team.
    const seed = await computeCarryOverSeed(user.id, teamId, occ.id);
    ci = (
      await db
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

  return { occurrenceId: occ.id, checkIn: ci, scheduleId: primary.id, localDate: today };
}

async function computeCarryOverSeed(userId: string, teamId: string, notOccId: string) {
  // Find the caller's most recent submitted check-in in this team,
  // excluding the current occurrence.
  const [prev] = await db
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

  const [ci] = await db.select().from(checkIns).where(eq(checkIns.id, parsed.checkInId));
  if (!ci || ci.userId !== user.id) throw new Error("Not your check-in");
  if (ci.status === "submitted") {
    // Editing a submitted one is fine — plan supports that pattern in later
    // phases. For now we allow updates on submitted rows too.
  }

  const patch: Partial<typeof checkIns.$inferInsert> = { updatedAt: new Date() };
  if (parsed.yesterday !== undefined) patch.yesterday = parsed.yesterday;
  if (parsed.today !== undefined) patch.today = parsed.today;
  if (parsed.blockers !== undefined) patch.blockers = parsed.blockers;

  await db.update(checkIns).set(patch).where(eq(checkIns.id, parsed.checkInId));
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
    const { checkInId, yesterday, today, blockers, videoSkip } = parsed.data;

    const [ci] = await db.select().from(checkIns).where(eq(checkIns.id, checkInId));
    if (!ci || ci.userId !== user.id) return { ok: false, error: "Not your check-in" };

    const [ctx] = await db
      .select({
        orgSlug: organizations.slug,
        teamSlug: teams.slug,
        orgId: organizations.id,
        requireVideo: teams.requireVideo,
      })
      .from(checkIns)
      .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
      .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
      .innerJoin(teams, eq(teams.id, schedules.teamId))
      .innerJoin(organizations, eq(organizations.id, teams.orgId))
      .where(eq(checkIns.id, checkInId));
    if (!ctx) return { ok: false, error: "Team not found" };

    // Mandatory video: a recording, or a stated reason for skipping it.
    const [recording] = await db
      .select({ id: recordings.id })
      .from(recordings)
      .where(eq(recordings.checkInId, checkInId))
      .limit(1);
    if (ctx.requireVideo && !recording && !videoSkip && !ci.videoSkipReason) {
      return { ok: false, error: "Your team asks for a video. Record one, or tell them why you can't today." };
    }
    const skip = !recording && videoSkip ? videoSkip : null;

    const firstSend = ci.status !== "submitted";
    const newMentions = firstSend
      ? null
      : [...mentionIds(yesterday, today, blockers)].filter((id) => !mentionIds(ci.yesterday, ci.today, ci.blockers).has(id));
    await db
      .update(checkIns)
      .set({
        yesterday,
        today,
        blockers,
        ...(skip ? { videoSkipReason: skip.reason, videoSkipNote: skip.note } : {}),
        status: "submitted",
        // Keep the original send time on edits so the feed order is stable.
        submittedAt: ci.submittedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(checkIns.id, checkInId));

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

export async function reopenCheckIn(checkInId: string) {
  const user = await requireUser();
  const [ci] = await db.select().from(checkIns).where(eq(checkIns.id, checkInId));
  if (!ci || ci.userId !== user.id) throw new Error("Not your check-in");
  await db
    .update(checkIns)
    .set({ status: "draft", submittedAt: null, updatedAt: new Date() })
    .where(eq(checkIns.id, checkInId));
}
