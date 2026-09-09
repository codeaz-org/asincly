"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  checkIns,
  members,
  occurrences,
  organizations,
  recordings,
  schedules,
  teams,
  users,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
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
  if (self) redirect("/");
  revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}/team`);
}

// ────────── Teams ──────────

const TeamNameSchema = z.string().min(1).max(80);

// Any member of the org can spin up a new team; they become its owner and
// get a default weekday schedule so the team works immediately.
export async function createTeam(orgId: string, formData: FormData) {
  const user = await requireUser();
  const name = TeamNameSchema.parse(formData.get("name"));

  const [callerRow] = await db
    .select({ id: members.id })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .where(and(eq(teams.orgId, orgId), eq(members.userId, user.id)));
  if (!callerRow) throw new Error("Not a member of this organization");

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
      name: "Daily standup",
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
  await db.delete(teams).where(eq(teams.id, teamId));
  redirect("/");
}

// ────────── Schedules (a team can run several standups) ──────────

const HHMM = /^\d{2}:\d{2}$/;

export async function createSchedule(teamId: string, formData: FormData) {
  const user = await requireUser();
  const ctx = await requireAdmin(teamId, user.id);
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
  await db.delete(schedules).where(eq(schedules.id, scheduleId));
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

export async function exportTeam(teamId: string) {
  const user = await requireUser();
  const row = await requireOwner(teamId, user.id);
  const bundle = await buildExportBundle(teamId);
  await audit({
    orgId: row.orgId,
    actorUserId: user.id,
    action: "team.export",
    resourceType: "team",
    resourceId: teamId,
  });
  return bundle;
}

export async function buildExportBundle(teamId: string) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) throw new Error("Team not found");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, team.orgId));
  const teamMembers = await db
    .select({
      id: members.id,
      role: members.role,
      userId: members.userId,
      userEmail: users.email,
      userName: users.name,
      userTz: users.tz,
      joinedAt: members.createdAt,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.teamId, teamId));

  const teamSchedules = await db.select().from(schedules).where(eq(schedules.teamId, teamId));
  const scheduleIds = teamSchedules.map((s) => s.id);

  const teamOccs = scheduleIds.length
    ? await db.select().from(occurrences).where(inArray(occurrences.scheduleId, scheduleIds))
    : [];
  const occIds = teamOccs.map((o) => o.id);

  const teamCheckIns = occIds.length
    ? await db.select().from(checkIns).where(inArray(checkIns.occurrenceId, occIds))
    : [];
  const ciIds = teamCheckIns.map((c) => c.id);

  const teamRecs = ciIds.length
    ? await db.select().from(recordings).where(inArray(recordings.checkInId, ciIds))
    : [];

  return {
    exportedAt: new Date().toISOString(),
    organization: org,
    team,
    members: teamMembers,
    schedules: teamSchedules,
    occurrences: teamOccs,
    checkIns: teamCheckIns,
    recordings: teamRecs.map((r) => ({
      ...r,
      transcript: safeDecrypt(r.transcriptCipher),
      summary: safeJsonDecrypt(r.summaryCipher),
      transcriptCipher: undefined,
      summaryCipher: undefined,
    })),
  };
}

function safeDecrypt(cipher: string): string {
  if (!cipher) return "";
  try {
    return decrypt(cipher);
  } catch {
    return "";
  }
}

function safeJsonDecrypt(cipher: string): unknown {
  if (!cipher) return null;
  try {
    return JSON.parse(decrypt(cipher));
  } catch {
    return null;
  }
}

// Hard delete: cascades to teams → members → schedules → occurrences →
// check-ins → recordings via FK ON DELETE CASCADE. Object storage cleanup
// happens on the next retention sweep (orphaned recordings can't be
// enumerated after the row is gone, so we clean by scanning the bucket
// prefix — Phase 5+ once we have a lot of teams).
export async function deleteOrg(orgId: string) {
  const user = await requireUser();
  // Any team the caller owns in this org proves ownership.
  const [row] = await db
    .select({ role: members.role, orgSlug: organizations.slug })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(and(eq(teams.orgId, orgId), eq(members.userId, user.id), eq(members.role, "owner")));
  if (!row) throw new Error("Owner only");

  await audit({
    orgId,
    actorUserId: user.id,
    action: "org.delete",
    resourceType: "organization",
    resourceId: orgId,
  });
  await db.delete(organizations).where(eq(organizations.id, orgId));
  redirect("/");
}
