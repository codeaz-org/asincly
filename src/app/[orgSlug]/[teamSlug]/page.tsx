import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { members, schedules, users } from "@/db/schema";
import { getTeamBySlug, requireUser } from "@/lib/session";
import { inviteMembers } from "@/lib/actions/onboarding";
import { localDate, windowFor, windowStatus } from "@/lib/time";
import { TzDetector } from "@/components/tz-detector";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ orgSlug: string; teamSlug: string }>;
}) {
  const { teamSlug } = await params;
  const user = await requireUser();
  const team = await getTeamBySlug(user.id, teamSlug);
  if (!team) notFound();

  // Everyone in this team, plus their user tz.
  const roster = await db
    .select({
      memberId: members.id,
      role: members.role,
      userId: users.id,
      name: users.name,
      email: users.email,
      tz: users.tz,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.teamId, team.teamId));

  const activeSchedules = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.teamId, team.teamId), eq(schedules.active, true)));

  const now = new Date();

  return (
    <main className="min-h-dvh p-6 max-w-4xl mx-auto space-y-10">
      <TzDetector currentTz={user.tz} />

      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {team.orgName}
          </p>
          <h1 className="text-2xl font-semibold">{team.teamName}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Signed in as {user.email} · {user.tz}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Schedule
        </h2>
        {activeSchedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active schedule.</p>
        ) : (
          activeSchedules.map((s) => (
            <div
              key={s.id}
              className="rounded-md border border-border p-4 flex items-baseline justify-between"
            >
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {s.rrule} · {s.windowOpenLocal.slice(0, 5)}–{s.windowCloseLocal.slice(0, 5)} local
                </p>
              </div>
              {(team.role === "owner" || team.role === "admin") && (
                <Link
                  href={`/s/${s.id}`}
                  className="text-sm underline underline-offset-2"
                >
                  Edit
                </Link>
              )}
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Timezone strip
        </h2>
        <ul className="divide-y divide-border rounded-md border border-border">
          {roster.map((m) => {
            const status = memberStatus(now, m.tz, activeSchedules[0]);
            return (
              <li key={m.memberId} className="p-3 flex items-center gap-3">
                <StatusDot status={status} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{m.name ?? m.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.tz} · local {localTime(now, m.tz)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground capitalize">{status}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {(team.role === "owner" || team.role === "admin") && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Invite teammates
          </h2>
          <form action={inviteMembers} className="flex gap-2">
            <input type="hidden" name="teamId" value={team.teamId} />
            <input
              name="emails"
              placeholder="alice@company.com, bob@company.com"
              required
              className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
            <button
              type="submit"
              className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium"
            >
              Invite
            </button>
          </form>
          <p className="text-xs text-muted-foreground">
            Invitees can sign in at <code>/sign-in</code> with the same email and they&apos;ll
            land here.
          </p>
        </section>
      )}
    </main>
  );
}

type Sched = {
  windowOpenLocal: string;
  windowCloseLocal: string;
} | undefined;

function memberStatus(now: Date, tz: string, s: Sched): "asleep" | "window open" | "window closed" {
  if (!s) return "asleep";
  const today = localDate(now, tz);
  const w = windowFor(today, s.windowOpenLocal.slice(0, 5), s.windowCloseLocal.slice(0, 5), tz);
  const status = windowStatus(now, w);
  if (status === "open") return "window open";
  if (status === "closed") return "window closed";
  return "asleep";
}

function localTime(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(now);
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "window open"
      ? "bg-emerald-500"
      : status === "window closed"
        ? "bg-zinc-400"
        : "bg-indigo-500";
  return <span className={`inline-block size-2 rounded-full ${color}`} />;
}
