import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Comments } from "@/components/check-in/comments";
import { PlanGate } from "@/components/billing/plan-gate";
import { CheckInCard } from "@/components/dashboard/check-in-card";
import { SectionTitle } from "@/components/ui/card";
import { dayLabel, entryName, namesById } from "@/lib/feed-view";
import { teamPath } from "@/lib/paths";
import { getCheckInDetail, getTeamRoster } from "@/lib/queries";
import { historyCutoff } from "@/lib/billing/plans";
import { localDate } from "@/lib/time";
import { getTeamPageContext, getTeamPlan } from "@/lib/team-context";

export const metadata = { title: "Check-in" };

export default async function CheckInDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; teamSlug: string; checkInId: string }>;
}) {
  const { orgSlug, teamSlug, checkInId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(checkInId)) notFound();
  const { user, team } = await getTeamPageContext(orgSlug, teamSlug);
  const [detail, roster, plan] = await Promise.all([
    getCheckInDetail(team.teamId, checkInId, user.id),
    getTeamRoster(team.teamId),
    getTeamPlan(orgSlug, teamSlug),
  ]);
  if (!detail) notFound();

  const root = teamPath(orgSlug, teamSlug);
  const back = `${root}?day=${detail.scheduleDate}`;

  const cutoff = historyCutoff(plan, localDate(new Date(), user.tz));
  if (cutoff && detail.scheduleDate < cutoff) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-6 md:pt-10 pb-16 space-y-8">
        <Link href={root} className="inline-flex items-center gap-1.5 text-sm text-soft hover:text-ink transition">
          <ArrowLeft className="size-4" /> Today
        </Link>
        <PlanGate
          title={`This check-in is older than ${plan.historyDays} days.`}
          hint="It's still stored. Upgrade to Pro to open your team's full history."
          href={`${root}/settings/billing`}
          canUpgrade={team.role === "owner"}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-6 md:pt-10 pb-16 space-y-8">
      <div className="space-y-4">
        <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-soft hover:text-ink transition">
          <ArrowLeft className="size-4" /> {dayLabel(detail.scheduleDate)}
        </Link>
        <h1 className="display text-3xl sm:text-4xl text-ink">
          {detail.entry.userId === user.id ? "Your check-in" : `${entryName(detail.entry)}'s check-in`}
        </h1>
      </div>

      <CheckInCard
        entry={detail.entry}
        viewerId={user.id}
        names={namesById(roster)}
        viewerCanManage={team.role !== "member"}
        expanded
      />

      <section className="space-y-4" aria-labelledby="replies">
        <SectionTitle count={detail.comments.filter((c) => !c.deleted).length}>
          <span id="replies">Replies</span>
        </SectionTitle>
        <Comments
          checkInId={checkInId}
          viewerId={user.id}
          comments={detail.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
        />
      </section>
    </div>
  );
}
