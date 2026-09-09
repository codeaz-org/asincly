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

async function requireOwner(teamId: string, userId: string) {
  const [row] = await db
    .select({ role: members.role, orgId: teams.orgId, orgSlug: organizations.slug, teamSlug: teams.slug })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(and(eq(members.teamId, teamId), eq(members.userId, userId)));
  if (!row || row.role !== "owner") throw new Error("Owner only");
  return row;
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
