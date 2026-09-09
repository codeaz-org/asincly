"use server";

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { checkIns, members, occurrences, organizations, schedules, teams } from "@/db/schema";
import { carryOver } from "@/lib/carry-over";
import { fireMentionEvents } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
import { localDate } from "@/lib/time";

// Get (or lazily create) today's occurrence for the primary active schedule
// of `teamId`, computed in the *caller's* tz. Returns the occurrence id +
// their existing check-in row if any (also lazily created as a draft).
export async function getOrCreateTodayContext(teamId: string, scheduleId?: string) {
  const user = await requireUser();

  // Membership check
  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.teamId, teamId), eq(members.userId, user.id)));
  if (!membership) throw new Error("Not a member of this team");

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
  | { ok: true; orgSlug: string; teamSlug: string }
  | { ok: false; error: string };

export async function submitCheckIn(
  _prev: SubmitResult | null,
  formData: FormData,
): Promise<SubmitResult> {
  let landing: { orgSlug: string; teamSlug: string } | null = null;
  try {
    const user = await requireUser();
    const checkInId = z.string().uuid().parse(formData.get("checkInId"));

    const yesterday = String(formData.get("yesterday") ?? "");
    const today = String(formData.get("today") ?? "");
    const blockers = String(formData.get("blockers") ?? "");

    const [ci] = await db.select().from(checkIns).where(eq(checkIns.id, checkInId));
    if (!ci || ci.userId !== user.id) return { ok: false, error: "Not your check-in" };

    await db
      .update(checkIns)
      .set({
        yesterday,
        today,
        blockers,
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(checkIns.id, checkInId));

    const [ctx] = await db
      .select({ orgSlug: organizations.slug, teamSlug: teams.slug })
      .from(checkIns)
      .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
      .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
      .innerJoin(teams, eq(teams.id, schedules.teamId))
      .innerJoin(organizations, eq(organizations.id, teams.orgId))
      .where(eq(checkIns.id, checkInId));

    if (!ctx) return { ok: false, error: "Team not found" };

    revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}`);
    landing = { orgSlug: ctx.orgSlug, teamSlug: ctx.teamSlug };

    // Fire mention + blocker events for teammates named in the check-in.
    void fireMentionEvents(checkInId).catch((e) =>
      console.error("[fireMentionEvents]", e),
    );
  } catch (e) {
    console.error("[submitCheckIn]", e);
    const msg = e instanceof Error ? e.message : "Submit failed";
    return { ok: false, error: msg };
  }
  // redirect() throws internally, so it must live outside the try/catch or
  // it looks like an error.
  redirect(`/${landing!.orgSlug}/${landing!.teamSlug}`);
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
