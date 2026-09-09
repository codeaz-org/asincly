import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schedules } from "@/db/schema";
import { AppShell } from "@/components/app-shell";
import { displayName } from "@/lib/display";
import { CheckInEditor } from "@/components/check-in-editor";
import { getOrCreateTodayContext } from "@/lib/actions/check-in";
import { getTeamRoster } from "@/lib/queries";
import { getTeamBySlug, requireUser } from "@/lib/session";

export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; teamSlug: string }>;
  searchParams: Promise<{ schedule?: string }>;
}) {
  const { orgSlug, teamSlug } = await params;
  const { schedule } = await searchParams;
  const user = await requireUser();
  const team = await getTeamBySlug(user.id, teamSlug);
  if (!team) notFound();

  const [ctx, roster, activeSchedules] = await Promise.all([
    getOrCreateTodayContext(team.teamId, schedule),
    getTeamRoster(team.teamId),
    db
      .select({ id: schedules.id, name: schedules.name })
      .from(schedules)
      .where(and(eq(schedules.teamId, team.teamId), eq(schedules.active, true))),
  ]);
  const candidates = roster
    .filter((r) => r.userId !== user.id)
    .map((r) => ({ userId: r.userId, name: displayName(r.name, r.email), email: r.email }));

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
      <div className="mx-auto max-w-5xl px-6 py-10 md:py-12 space-y-6">
        {activeSchedules.length > 1 && (
          <nav className="flex flex-wrap gap-2" aria-label="Standup">
            {activeSchedules.map((s) => (
              <Link
                key={s.id}
                href={`/${orgSlug}/${teamSlug}/check-in?schedule=${s.id}`}
                className={`h-9 px-4 rounded-full text-sm inline-flex items-center border transition ${
                  s.id === ctx.scheduleId
                    ? "border-emerald-400/60 bg-emerald-400/[0.08] text-foreground"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
                }`}
              >
                {s.name}
              </Link>
            ))}
          </nav>
        )}
        <CheckInEditor
          key={ctx.checkIn.id}
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
