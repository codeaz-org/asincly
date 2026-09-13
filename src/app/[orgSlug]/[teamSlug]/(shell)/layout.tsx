import { AppShell } from "@/components/app-shell";
import { TzDetector } from "@/components/tz-detector";
import { getTeamPageContext, getViewerToday } from "@/lib/team-context";

export default async function TeamShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; teamSlug: string }>;
}) {
  const { orgSlug, teamSlug } = await params;
  const [{ user, team }, today] = await Promise.all([
    getTeamPageContext(orgSlug, teamSlug),
    getViewerToday(orgSlug, teamSlug),
  ]);

  return (
    <AppShell
      orgSlug={orgSlug}
      teamSlug={teamSlug}
      orgName={team.orgName}
      teamName={team.teamName}
      role={team.role}
      userId={user.id}
      userEmail={user.email}
      myState={today.markState}
    >
      <TzDetector currentTz={user.tz} />
      {children}
    </AppShell>
  );
}
