import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InviteForm } from "@/components/invite-form";
import { createTeam, removeMember } from "@/lib/actions/team-admin";
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
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-medium tracking-tight">Team</h1>
            <p className="text-sm text-muted-foreground">
              {roster.length} {roster.length === 1 ? "person" : "people"} in {team.teamName}.
            </p>
          </div>
          <details className="relative">
            <summary className="cursor-pointer list-none h-10 px-4 rounded-md border border-white/10 text-sm hover:bg-white/[0.04] transition inline-flex items-center gap-2">
              + New team
            </summary>
            <form
              action={createTeam.bind(null, team.orgId)}
              className="absolute right-0 top-12 z-40 w-72 rounded-md border border-white/10 bg-zinc-950/95 backdrop-blur shadow-xl p-3 space-y-2"
            >
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                New team in {team.orgName}
              </p>
              <input
                name="name"
                required
                placeholder="Team name"
                className="w-full h-10 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm focus:outline-none focus:border-white/30 transition"
              />
              <button
                type="submit"
                className="w-full h-10 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 transition"
              >
                Create team
              </button>
              <p className="text-[10px] text-muted-foreground">
                You become its owner. A weekday standup is set up automatically.
              </p>
            </form>
          </details>
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
                    {m.role !== "owner" && (isAdmin || m.userId === user.id) && (
                      <form action={removeMember.bind(null, m.memberId)} className="shrink-0">
                        <button
                          type="submit"
                          aria-label={m.userId === user.id ? "Leave team" : `Remove ${m.name ?? m.email}`}
                          title={m.userId === user.id ? "Leave team" : "Remove from team"}
                          className="grid place-items-center size-7 rounded-md text-muted-foreground hover:text-red-300 hover:bg-red-400/10 transition text-sm"
                        >
                          ×
                        </button>
                      </form>
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
