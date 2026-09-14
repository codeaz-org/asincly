import { cache } from "react";
import { notFound } from "next/navigation";
import type { MarkState } from "@/components/brand/mark";
import { getEntitlements } from "@/lib/billing/entitlements";
import { memberStatus } from "@/lib/day-rail";
import { awayToday, getActiveSchedules, getAwayPeriods, getMyCheckIn } from "@/lib/queries";
import { getTeamBySlug, requireUser } from "@/lib/session";
import { localDate, nextOccurrenceDate, occursOn } from "@/lib/time";

// Layout and page both need the viewer + team; cache() dedupes the lookups
// within one request.
export const getTeamPageContext = cache(async (orgSlug: string, teamSlug: string) => {
  const user = await requireUser();
  const team = await getTeamBySlug(user.id, teamSlug, orgSlug);
  if (!team) notFound();
  return { user, team };
});

export const getViewerToday = cache(async (orgSlug: string, teamSlug: string) => {
  const { user, team } = await getTeamPageContext(orgSlug, teamSlug);
  const now = new Date();
  const todayISO = localDate(now, user.tz);
  const [schedules, mine, away] = await Promise.all([
    getActiveSchedules(team.teamId),
    getMyCheckIn(team.teamId, todayISO, user.id),
    getAwayPeriods(team.teamId, now),
  ]);
  const myAway = awayToday(away, user.id, user.tz, now);
  const primary = schedules[0] ?? null;
  // A day the RRULE doesn't cover has no window to be inside, so the viewer's
  // mark must not claim one is open — the check-in page would refuse.
  const offToday = !!primary && !occursOn(primary.rrule, todayISO);
  const status = memberStatus(now, user.tz, offToday ? null : primary, {
    done: mine?.status === "submitted",
    away: !!myAway,
  });
  const markState: MarkState = offToday && !myAway ? "asleep" : status;
  const nextDate = offToday && primary ? nextOccurrenceDate(primary.rrule, now, user.tz) : null;
  return { now, todayISO, schedules, primary, mine, away, myAway, markState, offToday, nextDate };
});

// What the team's organization may do on its plan (everything when self-hosted).
export const getTeamPlan = cache(async (orgSlug: string, teamSlug: string) => {
  const { team } = await getTeamPageContext(orgSlug, teamSlug);
  return getEntitlements(team.orgId);
});
