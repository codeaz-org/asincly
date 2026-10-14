import { and, eq } from "drizzle-orm";
import { withUser } from "@/db/with-user";
import { checkIns, members, occurrences, organizations, schedules, teams } from "@/db/schema";

// The caller's own check-in, only while they're still a contributing member
// of its team: someone removed from a team (or now a guest) can no longer
// edit, send, reopen or attach video to what they wrote there.
export async function authorCheckIn(checkInId: string, userId: string) {
  const [row] = await withUser(userId, (tx) =>
    tx
      .select({
        ci: checkIns,
        teamId: teams.id,
        orgId: organizations.id,
        orgSlug: organizations.slug,
        teamSlug: teams.slug,
        requireVideo: teams.requireVideo,
        role: members.role,
      })
      .from(checkIns)
      .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
      .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
      .innerJoin(teams, eq(teams.id, schedules.teamId))
      .innerJoin(organizations, eq(organizations.id, teams.orgId))
      .innerJoin(members, and(eq(members.teamId, teams.id), eq(members.userId, userId)))
      .where(and(eq(checkIns.id, checkInId), eq(checkIns.userId, userId))),
  );
  if (!row || row.role === "guest") return null;
  return row;
}
