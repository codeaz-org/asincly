"use server";

import { and, eq, inArray, ne, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { checkIns, members, occurrences, organizations, recordings, schedules, teams, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { assertCanAddMembers, assertCanCreateTeam, assertFeature, limitResult } from "@/lib/billing/entitlements";
import { cancelSubscriptionForDeletedOrg, syncSeats } from "@/lib/billing/seats";
import { deleteRecordingObjects, recordingKeys } from "@/lib/recording-objects";
import { revokeSlackFor } from "@/lib/slack/notify";
import { TeamRulesSchema } from "@/lib/validation/social";
import { requireUser } from "@/lib/session";

async function membershipOf(teamId: string, userId: string) {
  const [row] = await db
    .select({ role: members.role, orgId: teams.orgId, orgSlug: organizations.slug, teamSlug: teams.slug })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(and(eq(members.teamId, teamId), eq(members.userId, userId)));
  return row ?? null;
}

async function requireOwner(teamId: string, userId: string) {
  const row = await membershipOf(teamId, userId);
  if (!row || row.role !== "owner") throw new Error("Owner only");
  return row;
}

async function requireAdmin(teamId: string, userId: string) {
  const row = await membershipOf(teamId, userId);
  if (!row || (row.role !== "owner" && row.role !== "admin")) {
    throw new Error("Admins only");
  }
  return row;
}

// Check-in ids under a team / schedule / org, for collecting bucket keys
// before a cascading delete removes the rows that point at them.
function checkInsWhere(where: SQL) {
  return db
    .select({ id: checkIns.id })
    .from(checkIns)
    .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
    .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
    .innerJoin(teams, eq(teams.id, schedules.teamId))
    .where(where);
}

// ────────── Members ──────────

// Admins remove anyone below owner; anyone can remove themselves (leave).
export async function removeMember(memberId: string) {
  const user = await requireUser();
  const [target] = await db
    .select({ id: members.id, teamId: members.teamId, userId: members.userId, role: members.role })
    .from(members)
    .where(eq(members.id, memberId));
  if (!target) throw new Error("Member not found");

  const self = target.userId === user.id;
  const ctx = self
    ? await membershipOf(target.teamId, user.id)
    : await requireAdmin(target.teamId, user.id);
  if (!ctx) throw new Error("Not a member of this team");
  if (target.role === "owner") throw new Error("The owner can't be removed. Transfer or delete the team.");

  await db.delete(members).where(eq(members.id, memberId));
  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: self ? "member.leave" : "member.remove",
    resourceType: "member",
    resourceId: memberId,
    meta: { teamId: target.teamId, removedUserId: target.userId },
  });
  await syncSeats(ctx.orgId);
  if (self) redirect("/");
  revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}/team`);
}

// ────────── Roles and ownership ──────────

export type RoleResult = { ok: true } | { ok: false; error: string; upgrade?: boolean };

const SetRoleSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(["admin", "member", "guest"]),
});

// Team owners set anyone else's role below owner. Seats and the guest
// feature are checked the way invites check them.
export async function setMemberRole(input: unknown): Promise<RoleResult> {
  const user = await requireUser();
  const parsed = SetRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid role" };
  const [target] = await db
    .select({ teamId: members.teamId, userId: members.userId, role: members.role })
    .from(members)
    .where(eq(members.id, parsed.data.memberId));
  if (!target) return { ok: false, error: "Member not found" };
  const ctx = await requireOwner(target.teamId, user.id);
  if (target.userId === user.id) return { ok: false, error: "You can't change your own role" };
  if (target.role === "owner") return { ok: false, error: "Transfer ownership instead" };
  if (target.role === parsed.data.role) return { ok: true };

  try {
    if (parsed.data.role === "guest") await assertFeature(ctx.orgId, "guests");
    if (target.role === "guest") {
      // Becoming a contributor takes a seat unless they hold one elsewhere in the org.
      const [seated] = await db
        .select({ id: members.id })
        .from(members)
        .innerJoin(teams, eq(teams.id, members.teamId))
        .where(and(eq(teams.orgId, ctx.orgId), eq(members.userId, target.userId), ne(members.role, "guest")))
        .limit(1);
      if (!seated) await assertCanAddMembers(ctx.orgId, 1);
    }
  } catch (e) {
    const limited = limitResult(e);
    if (limited && !limited.ok) return { ok: false, error: limited.error, upgrade: true };
    throw e;
  }

  await db.update(members).set({ role: parsed.data.role }).where(eq(members.id, parsed.data.memberId));
  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "member.set_role",
    resourceType: "member",
    resourceId: parsed.data.memberId,
    meta: { teamId: target.teamId, from: target.role, to: parsed.data.role },
  });
  await syncSeats(ctx.orgId);
  revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}`, "layout");
  return { ok: true };
}

// The team owner hands the team to another contributor and stays on as admin.
export async function transferTeamOwnership(memberId: unknown): Promise<RoleResult> {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(memberId);
  if (!id.success) return { ok: false, error: "Member not found" };
  const [target] = await db
    .select({ teamId: members.teamId, userId: members.userId, role: members.role })
    .from(members)
    .where(eq(members.id, id.data));
  if (!target) return { ok: false, error: "Member not found" };
  const ctx = await requireOwner(target.teamId, user.id);
  if (target.userId === user.id) return { ok: true };
  if (target.role === "guest") return { ok: false, error: "Make them a member first" };

  await db.transaction(async (tx) => {
    await tx.update(members).set({ role: "owner" }).where(eq(members.id, id.data));
    await tx
      .update(members)
      .set({ role: "admin" })
      .where(and(eq(members.teamId, target.teamId), eq(members.userId, user.id)));
  });
  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "team.transfer_ownership",
    resourceType: "team",
    resourceId: target.teamId,
    meta: { to: target.userId },
  });
  revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}`, "layout");
  return { ok: true };
}

// The org owner (billing, deleting the org) hands that role to someone who
// already runs a team in it.
export async function transferOrgOwnership(input: unknown): Promise<RoleResult> {
  const user = await requireUser();
  const parsed = z.object({ orgId: z.string().uuid(), email: z.string().trim().toLowerCase().email().max(254) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter their email address" };
  const { orgId, email } = parsed.data;
  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(and(eq(organizations.id, orgId), eq(organizations.ownerUserId, user.id)));
  if (!org) return { ok: false, error: "Only the organization owner can do this" };
  const [eligible] = await db
    .select({ userId: members.userId })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(teams.orgId, orgId), eq(users.email, email), inArray(members.role, ["owner", "admin"])))
    .limit(1);
  if (!eligible) return { ok: false, error: "They need to own or administer a team in this organization first" };
  const userId = eligible.userId;
  if (userId === user.id) return { ok: true };

  await db.update(organizations).set({ ownerUserId: userId }).where(eq(organizations.id, orgId));
  await audit({
    orgId,
    actorUserId: user.id,
    action: "org.transfer_ownership",
    resourceType: "organization",
    resourceId: orgId,
    meta: { to: userId },
  });
  revalidatePath(`/${org.slug}`, "layout");
  return { ok: true };
}

// ────────── Teams ──────────

const TeamNameSchema = z.string().min(1).max(80);

// Owners and admins of a team in the org can spin up a new team; they become
// its owner and get a default weekday schedule so the team works immediately.
// Members and guests can't: owning a team grants invites, retention and export.
export async function createTeam(orgId: string, formData: FormData) {
  const user = await requireUser();
  const name = TeamNameSchema.parse(formData.get("name"));

  const [callerRow] = await db
    .select({ id: members.id })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .where(
      and(eq(teams.orgId, orgId), eq(members.userId, user.id), inArray(members.role, ["owner", "admin"])),
    );
  if (!callerRow) throw new Error("Only team owners and admins can create teams");
  await assertCanCreateTeam(orgId);

  const { slugify } = await import("@/lib/slug");
  const base = slugify(name);
  let slug = base;
  for (let i = 0; i < 10; i++) {
    const clash = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.orgId, orgId), eq(teams.slug, slug)));
    if (clash.length === 0) break;
    slug = `${base}-${Math.random().toString(36).slice(2, 5)}`;
  }

  const created = await db.transaction(async (tx) => {
    const [team] = await tx.insert(teams).values({ orgId, name, slug }).returning();
    await tx.insert(members).values({ teamId: team.id, userId: user.id, role: "owner" });
    await tx.insert(schedules).values({
      teamId: team.id,
      name: "Daily check-in",
      rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      windowOpenLocal: "09:00",
      windowCloseLocal: "11:00",
    });
    return team;
  });

  await audit({
    orgId,
    actorUserId: user.id,
    action: "team.create",
    resourceType: "team",
    resourceId: created.id,
    meta: { name },
  });

  const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, orgId));
  redirect(`/${org.slug}/${created.slug}`);
}

export async function renameTeam(teamId: string, formData: FormData) {
  const user = await requireUser();
  const name = TeamNameSchema.parse(formData.get("name"));
  const ctx = await requireAdmin(teamId, user.id);
  await db.update(teams).set({ name }).where(eq(teams.id, teamId));
  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "team.rename",
    resourceType: "team",
    resourceId: teamId,
    meta: { name },
  });
  revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}`, "layout");
}

// Owner-only. The last team in an org can't be deleted (delete the org instead).
export async function deleteTeam(teamId: string) {
  const user = await requireUser();
  const ctx = await requireOwner(teamId, user.id);
  const siblings = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.orgId, ctx.orgId));
  if (siblings.length <= 1) {
    throw new Error("This is the only team. Delete the organization instead.");
  }
  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "team.delete",
    resourceType: "team",
    resourceId: teamId,
  });
  await revokeSlackFor({ teamId });
  const keys = await recordingKeys(inArray(recordings.checkInId, checkInsWhere(eq(schedules.teamId, teamId))));
  await db.delete(teams).where(eq(teams.id, teamId));
  await deleteRecordingObjects(keys);
  await syncSeats(ctx.orgId);
  redirect("/");
}

// ────────── Schedules (a team can run several check-ins) ──────────

const HHMM = /^\d{2}:\d{2}$/;

export async function createSchedule(teamId: string, formData: FormData) {
  const user = await requireUser();
  const ctx = await requireAdmin(teamId, user.id);
  const existing = await db.select({ id: schedules.id }).from(schedules).where(eq(schedules.teamId, teamId));
  if (existing.length > 0) await assertFeature(ctx.orgId, "multipleSchedules");
  const parsed = z
    .object({
      name: z.string().min(1).max(80),
      windowOpen: z.string().regex(HHMM),
      windowClose: z.string().regex(HHMM),
    })
    .parse({
      name: formData.get("name"),
      windowOpen: formData.get("windowOpen") || "09:00",
      windowClose: formData.get("windowClose") || "11:00",
    });
  const [created] = await db
    .insert(schedules)
    .values({
      teamId,
      name: parsed.name,
      rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      windowOpenLocal: parsed.windowOpen,
      windowCloseLocal: parsed.windowClose,
    })
    .returning();
  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "schedule.create",
    resourceType: "schedule",
    resourceId: created.id,
    meta: { teamId, name: parsed.name },
  });
  revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}/settings`);
}

export async function deleteSchedule(scheduleId: string) {
  const user = await requireUser();
  const [sched] = await db
    .select({ id: schedules.id, teamId: schedules.teamId })
    .from(schedules)
    .where(eq(schedules.id, scheduleId));
  if (!sched) throw new Error("Schedule not found");
  const ctx = await requireAdmin(sched.teamId, user.id);
  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "schedule.delete",
    resourceType: "schedule",
    resourceId: scheduleId,
  });
  const keys = await recordingKeys(inArray(recordings.checkInId, checkInsWhere(eq(schedules.id, scheduleId))));
  await db.delete(schedules).where(eq(schedules.id, scheduleId));
  await deleteRecordingObjects(keys);
  revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}/settings`);
}

const RetentionSchema = z.object({
  teamId: z.string().uuid(),
  days: z.number().int().min(0).max(3650),
});

export async function setRecordingRetention(input: {
  teamId: string;
  days: number;
}) {
  const user = await requireUser();
  const parsed = RetentionSchema.parse(input);
  const row = await requireOwner(parsed.teamId, user.id);
  await db
    .update(teams)
    .set({ recordingRetentionDays: parsed.days })
    .where(eq(teams.id, parsed.teamId));
  await audit({
    orgId: row.orgId,
    actorUserId: user.id,
    action: "team.set_retention",
    resourceType: "team",
    resourceId: parsed.teamId,
    meta: { days: parsed.days },
  });
  revalidatePath(`/${row.orgSlug}/${row.teamSlug}`);
}

// Owners and admins decide whether a video is expected with every check-in.
export async function setTeamRules(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = TeamRulesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid settings" };
  const row = await requireAdmin(parsed.data.teamId, user.id);
  if (parsed.data.requireVideo) {
    try {
      await assertFeature(row.orgId, "requireVideoRule");
    } catch (e) {
      const limited = limitResult(e);
      if (limited && !limited.ok) return { ok: false, error: limited.error };
      throw e;
    }
  }
  await db.update(teams).set({ requireVideo: parsed.data.requireVideo }).where(eq(teams.id, parsed.data.teamId));
  await audit({
    orgId: row.orgId,
    actorUserId: user.id,
    action: "team.set_rules",
    resourceType: "team",
    resourceId: parsed.data.teamId,
    meta: { requireVideo: parsed.data.requireVideo },
  });
  revalidatePath(`/${row.orgSlug}/${row.teamSlug}`, "layout");
  return { ok: true };
}

// Hard delete: cascades to teams → members → schedules → occurrences →
// check-ins → recordings via FK ON DELETE CASCADE. Object storage cleanup
// happens on the next retention sweep (orphaned recordings can't be
// enumerated after the row is gone, so we clean by scanning the bucket
// prefix — Phase 5+ once we have a lot of teams).
export async function deleteOrg(orgId: string) {
  const user = await requireUser();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.id, orgId), eq(organizations.ownerUserId, user.id)));
  if (!org) throw new Error("Only the organization owner can delete it");

  await audit({
    orgId,
    actorUserId: user.id,
    action: "org.delete",
    resourceType: "organization",
    resourceId: orgId,
  });
  await cancelSubscriptionForDeletedOrg(orgId);
  await revokeSlackFor({ orgId });
  const keys = await recordingKeys(inArray(recordings.checkInId, checkInsWhere(eq(teams.orgId, orgId))));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await deleteRecordingObjects(keys);
  redirect("/");
}
