import { notFound } from "next/navigation";
import { CheckInEditor } from "@/components/check-in-editor";
import { getOrCreateTodayContext } from "@/lib/actions/check-in";
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

  const ctx = await getOrCreateTodayContext(team.teamId);

  return (
    <main className="min-h-dvh px-6 py-10 md:py-14 flex items-start justify-center">
      <div className="w-full max-w-2xl">
        <CheckInEditor
          checkInId={ctx.checkIn.id}
          yesterday={ctx.checkIn.yesterday}
          today={ctx.checkIn.today}
          blockers={ctx.checkIn.blockers}
          status={ctx.checkIn.status}
          backHref={`/${orgSlug}/${teamSlug}`}
          localDate={ctx.localDate}
        />
      </div>
    </main>
  );
}
