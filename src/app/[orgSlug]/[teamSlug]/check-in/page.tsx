import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CheckInEditor } from "@/components/check-in-editor";
import { getOrCreateTodayContext } from "@/lib/actions/check-in";
import { getTeamRoster } from "@/lib/queries";
import { getTeamBySlug, requireUser } from "@/lib/session";

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ orgSlug: string; teamSlug: string }>;
}) {
  const { orgSlug, teamSlug } = await params;
  const user = await requireUser();
  const team = await getTeamBySlug(user.id, teamSlug);
  if (!team) notFound();

  const [ctx, roster] = await Promise.all([
    getOrCreateTodayContext(team.teamId),
    getTeamRoster(team.teamId),
  ]);
  const candidates = roster
    .filter((r) => r.userId !== user.id)
    .map((r) => ({ userId: r.userId, name: r.name ?? r.email, email: r.email }));

  return (
    <AppShell
      orgSlug={orgSlug}
      teamSlug={teamSlug}
      orgName={team.orgName}
      teamName={team.teamName}
      role={team.role}
      userId={user.id}
      userEmail={user.email}
      active="feed"
    >
      <div className="mx-auto max-w-2xl px-6 py-10 md:py-12">
        <CheckInEditor
          checkInId={ctx.checkIn.id}
          yesterday={ctx.checkIn.yesterday}
          today={ctx.checkIn.today}
          blockers={ctx.checkIn.blockers}
          status={ctx.checkIn.status}
          backHref={`/${orgSlug}/${teamSlug}`}
          localDate={ctx.localDate}
          mentionCandidates={candidates}
        />
      </div>
    </AppShell>
  );
}
