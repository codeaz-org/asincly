import { eq, inArray } from "drizzle-orm";
import type { Q } from "@/db/with-user";
import {
  blockerActions,
  checkInComments,
  checkInReactions,
  checkIns,
  memberAway,
  members,
  occurrences,
  organizations,
  recordings,
  schedules,
  teams,
  users,
} from "@/db/schema";
import { decrypt } from "@/lib/crypto";

// Everything a team owns, transcripts and summaries decrypted. Read with the
// owner's withUser() connection; callers check ownership and write the audit
// row. Deliberately not in a
// "use server" module — every export there is a callable server action.
export async function buildExportBundle(q: Q, teamId: string) {
  const [team] = await q.select().from(teams).where(eq(teams.id, teamId));
  if (!team) throw new Error("Team not found");
  const [org] = await q.select().from(organizations).where(eq(organizations.id, team.orgId));
  const teamMembers = await q
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

  const teamSchedules = await q.select().from(schedules).where(eq(schedules.teamId, teamId));
  const scheduleIds = teamSchedules.map((s) => s.id);

  const teamOccs = scheduleIds.length
    ? await q.select().from(occurrences).where(inArray(occurrences.scheduleId, scheduleIds))
    : [];
  const occIds = teamOccs.map((o) => o.id);

  const teamCheckIns = occIds.length
    ? await q.select().from(checkIns).where(inArray(checkIns.occurrenceId, occIds))
    : [];
  const ciIds = teamCheckIns.map((c) => c.id);

  const [teamRecs, comments, reactions, blockerActs, awayPeriods] = await Promise.all([
    ciIds.length ? q.select().from(recordings).where(inArray(recordings.checkInId, ciIds)) : [],
    ciIds.length ? q.select().from(checkInComments).where(inArray(checkInComments.checkInId, ciIds)) : [],
    ciIds.length ? q.select().from(checkInReactions).where(inArray(checkInReactions.checkInId, ciIds)) : [],
    ciIds.length ? q.select().from(blockerActions).where(inArray(blockerActions.checkInId, ciIds)) : [],
    q.select().from(memberAway).where(eq(memberAway.teamId, teamId)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    organization: org,
    team,
    members: teamMembers,
    schedules: teamSchedules,
    occurrences: teamOccs,
    checkIns: teamCheckIns,
    comments: comments.map((c) => (c.deletedAt ? { ...c, body: "" } : c)),
    reactions,
    blockerActions: blockerActs,
    awayPeriods,
    recordings: teamRecs.map((r) => ({
      ...r,
      transcript: safeDecrypt(r.transcriptCipher, `recording:${r.id}:transcript`),
      summary: safeJsonDecrypt(r.summaryCipher, `recording:${r.id}:summary`),
      transcriptCipher: undefined,
      summaryCipher: undefined,
    })),
  };
}

function safeDecrypt(cipher: string, context: string): string {
  if (!cipher) return "";
  try {
    return decrypt(cipher, context);
  } catch {
    return "";
  }
}

function safeJsonDecrypt(cipher: string, context: string): unknown {
  if (!cipher) return null;
  try {
    return JSON.parse(decrypt(cipher, context));
  } catch {
    return null;
  }
}
