import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InviteForm } from "@/components/invite-form";
import { getTeamRoster } from "@/lib/queries";
import { getTeamBySlug, requireUser } from "@/lib/session";

export default async function TeamRosterPage({
  params,
}: {
  params: Promise<{ orgSlug: string; teamSlug: string }>;
}) {
  const { orgSlug, teamSlug } = await params;
  const user = await requireUser();
  const team = await getTeamBySlug(user.id, teamSlug);
  if (!team) notFound();

  const roster = await getTeamRoster(team.teamId);
  const isAdmin = team.role === "owner" || team.role === "admin";

  const now = new Date();

  return (
    <AppShell
      orgSlug={orgSlug}
      teamSlug={teamSlug}
      orgName={team.orgName}
      teamName={team.teamName}
      role={team.role}
      userId={user.id}
      userEmail={user.email}
      active="team"
    >
      <div className="mx-auto max-w-4xl px-6 py-10 md:py-12 space-y-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-medium tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            {roster.length} {roster.length === 1 ? "person" : "people"} in {team.teamName}.
          </p>
        </header>

        <section className="space-y-3">
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {roster
              .slice()
              .sort((a, b) =>
                (a.name ?? a.email).localeCompare(b.name ?? b.email),
              )
              .map((m) => (
                <li
                  key={m.memberId}
                  className="rounded-md border border-white/[0.06] px-4 py-3.5 hover:border-white/10 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid place-items-center size-9 rounded-full bg-white/[0.05] text-sm font-medium shrink-0">
                      {(m.name ?? m.email)[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {m.name ?? m.email}
                        {m.userId === user.id && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                            you
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-mono tabular-nums">{localTime(now, m.tz)}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {m.tz.split("/").slice(-1)[0].replace("_", " ")}
                      </div>
                    </div>
                    {m.role !== "member" && (
                      <span className="text-[10px] uppercase tracking-wider text-accent border border-accent/30 rounded px-1.5 py-0.5 shrink-0">
                        {m.role}
                      </span>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </section>

        {isAdmin && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Invite
            </h2>
            <InviteForm teamId={team.teamId} />
          </section>
        )}
      </div>
    </AppShell>
  );
}

function localTime(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(now);
}
