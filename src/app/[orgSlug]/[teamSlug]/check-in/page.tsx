import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { MarkLoader } from "@/components/brand/loader";
import { CheckInFlow } from "@/components/check-in/flow";
import { TzDetector } from "@/components/tz-detector";
import { db } from "@/db";
import { recordings } from "@/db/schema";
import { getOrCreateTodayContext } from "@/lib/actions/check-in";
import { getPreviousContext } from "@/lib/check-in-context";
import { displayName } from "@/lib/display";
import { dayLabel } from "@/lib/feed-view";
import { checkInFlowPath, teamPath } from "@/lib/paths";
import { getActiveSchedules, getTeamRoster } from "@/lib/queries";
import { getTeamPageContext, getTeamPlan } from "@/lib/team-context";
import { VIDEO_SKIP_REASONS } from "@/lib/validation/social";

export const metadata = { title: "Check in" };

// Focus mode: no app shell, one question per screen.
export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; teamSlug: string }>;
  searchParams: Promise<{ schedule?: string }>;
}) {
  const { orgSlug, teamSlug } = await params;
  const { schedule } = await searchParams;
  const { user, team } = await getTeamPageContext(orgSlug, teamSlug);
  if (team.role === "guest") redirect(teamPath(orgSlug, teamSlug));

  const [ctx, roster, activeSchedules, plan] = await Promise.all([
    getOrCreateTodayContext(team.teamId, schedule),
    getTeamRoster(team.teamId),
    getActiveSchedules(team.teamId),
    getTeamPlan(orgSlug, teamSlug),
  ]);
  const [existing, previous] = await Promise.all([
    db
      .select({ id: recordings.id, status: recordings.status })
      .from(recordings)
      .where(eq(recordings.checkInId, ctx.checkIn.id)),
    getPreviousContext(team.teamId, user.id, ctx.occurrenceId),
  ]);
  const pending = existing.find((r) => ["uploaded", "processing", "transcribing", "drafting"].includes(r.status));
  const skipReason = VIDEO_SKIP_REASONS.find((r) => r === ctx.checkIn.videoSkipReason);

  const candidates = roster
    .filter((r) => r.userId !== user.id)
    .map((r) => ({ userId: r.userId, name: displayName(r.name, r.email), email: r.email }));
  const flowPath = checkInFlowPath(orgSlug, teamSlug);

  return (
    <>
      <TzDetector currentTz={user.tz} />
      <Suspense
        fallback={
          <div className="min-h-dvh grid place-items-center">
            <MarkLoader size="md" />
          </div>
        }
      >
        <CheckInFlow
          key={ctx.checkIn.id}
          checkInId={ctx.checkIn.id}
          yesterday={ctx.checkIn.yesterday}
          today={ctx.checkIn.today}
          blockers={ctx.checkIn.blockers}
          status={ctx.checkIn.status}
          localDate={ctx.localDate}
          dayLabel={dayLabel(ctx.localDate)}
          teamName={team.teamName}
          backHref={teamPath(orgSlug, teamSlug)}
          viewer={{ userId: user.id, name: user.name, email: user.email, tz: user.tz }}
          mentionCandidates={candidates}
          existingRecordings={existing.length}
          edited={ctx.checkIn.updatedAt.getTime() - ctx.checkIn.createdAt.getTime() > 1000}
          // A downgraded org keeps the setting but stops enforcing it.
          requireVideo={team.requireVideo && plan.requireVideoRule}
          maxVideoSeconds={plan.maxVideoSeconds}
          billingHref={plan.plan === "unlimited" ? null : `${teamPath(orgSlug, teamSlug)}/settings/billing`}
          videoSkip={skipReason ? { reason: skipReason, note: ctx.checkIn.videoSkipNote } : null}
          context={{
            lastDate: previous.lastDate,
            lastDateLabel: previous.lastDate ? dayLabel(previous.lastDate) : null,
            previous: previous.previous,
            openBlockers: previous.openBlockers,
          }}
          pendingRecordingId={pending?.id ?? null}
          schedules={activeSchedules.map((s) => ({
            id: s.id,
            name: s.name,
            href: `${flowPath}?schedule=${s.id}`,
            active: s.id === ctx.scheduleId,
          }))}
        />
      </Suspense>
    </>
  );
}
