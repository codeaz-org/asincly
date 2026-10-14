import { Suspense } from "react";
import { withUser } from "@/db/with-user";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { MarkLoader } from "@/components/brand/loader";
import { LogoMark } from "@/components/brand/mark";
import { CheckInFlow } from "@/components/check-in/flow";
import { buttonVariants } from "@/components/ui/button";
import { TzDetector } from "@/components/tz-detector";
import { recordings, teams, users } from "@/db/schema";
import { aiProcessorLabel } from "@/lib/ai";
import { getOrCreateTodayContext } from "@/lib/actions/check-in";
import { getPreviousContext } from "@/lib/check-in-context";
import { displayName } from "@/lib/display";
import { dayLabel } from "@/lib/feed-view";
import { checkInFlowPath, teamPath } from "@/lib/paths";
import { getActiveSchedules, getTeamRoster } from "@/lib/queries";
import { getTeamPageContext, getTeamPlan } from "@/lib/team-context";
import { VIDEO_SKIP_REASONS } from "@/lib/validation/social";

// registerRecording runs transcription + drafting in after(), inside this
// route's function; a long take can outlast the platform's default limit.
export const maxDuration = 300;

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

  const [ctx, [roster, activeSchedules, [ai]], plan] = await Promise.all([
    getOrCreateTodayContext(team.teamId, schedule),
    withUser(user.id, (tx) =>
      Promise.all([
        getTeamRoster(tx, team.teamId),
        getActiveSchedules(tx, team.teamId),
        tx
          .select({ teamOn: teams.aiEnabled, optedOut: users.aiOptOut })
          .from(teams)
          .innerJoin(users, eq(users.id, user.id))
          .where(eq(teams.id, team.teamId)),
      ]),
    ),
    getTeamPlan(orgSlug, teamSlug),
  ]);
  // Said before anyone records: where the audio goes, or that it goes nowhere.
  const processor = aiProcessorLabel();
  const aiNotice = !processor
    ? null
    : !ai.teamOn
      ? "AI drafting is off for this team: your video is kept as is, and you write the check-in."
      : ai.optedOut
        ? "You've turned off AI drafting: your video is kept as is, and you write the check-in."
        : `When you stop, the audio goes to ${processor} to transcribe it and draft your check-in. You review the draft before anyone sees it. Turn this off under your account.`;
  // Not a standup day for this schedule — nothing was created, so there is no
  // draft to show.
  if (ctx.offDay) {
    return (
      <div className="flex min-h-dvh flex-col">
        <main className="flex-1 grid place-items-center px-6">
          <div className="max-w-md text-center flex flex-col items-center gap-6">
            <LogoMark size={56} state="asleep" className="text-ink" />
            <div className="space-y-3">
              <p className="kicker">{team.teamName}</p>
              <h1 className="display text-4xl text-ink">No check-in today.</h1>
              <p className="text-soft">
                {ctx.nextDate
                  ? `${team.teamName} checks in on a schedule. The next one is ${dayLabel(ctx.nextDate)}.`
                  : `${team.teamName} has no upcoming check-ins on this schedule.`}
              </p>
            </div>
            <Link
              href={teamPath(orgSlug, teamSlug)}
              className={buttonVariants({ variant: "primary", size: "lg" })}
            >
              Back to your team
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const [existing, previous] = await withUser(user.id, (tx) =>
    Promise.all([
      tx
        .select({ id: recordings.id, status: recordings.status })
        .from(recordings)
        .where(eq(recordings.checkInId, ctx.checkIn.id)),
      getPreviousContext(tx, team.teamId, user.id, ctx.occurrenceId),
    ]),
  );
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
          aiNotice={aiNotice}
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
