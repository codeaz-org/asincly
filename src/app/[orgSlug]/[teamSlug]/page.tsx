import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { members, schedules, users } from "@/db/schema";
import { TzDetector } from "@/components/tz-detector";
import { inviteMembers } from "@/lib/actions/onboarding";
import { getTeamBySlug, requireUser } from "@/lib/session";
import { localDate, windowFor, windowStatus } from "@/lib/time";

type MemberRow = {
  memberId: string;
  role: "owner" | "admin" | "member";
  userId: string;
  name: string | null;
  email: string;
  tz: string;
};

type Sched = {
  id: string;
  name: string;
  rrule: string;
  windowOpenLocal: string;
  windowCloseLocal: string;
};

export default async function TeamPage({
  params,
}: {
  params: Promise<{ orgSlug: string; teamSlug: string }>;
}) {
  const { teamSlug } = await params;
  const user = await requireUser();
  const team = await getTeamBySlug(user.id, teamSlug);
  if (!team) notFound();

  const roster: MemberRow[] = await db
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

  const activeSchedules: Sched[] = await db
    .select({
      id: schedules.id,
      name: schedules.name,
      rrule: schedules.rrule,
      windowOpenLocal: schedules.windowOpenLocal,
      windowCloseLocal: schedules.windowCloseLocal,
    })
    .from(schedules)
    .where(and(eq(schedules.teamId, team.teamId), eq(schedules.active, true)));

  const now = new Date();
  const primary: Sched | undefined = activeSchedules[0];
  const isAdmin = team.role === "owner" || team.role === "admin";

  const rows = roster
    .map((m) => ({ ...m, status: memberStatus(now, m.tz, primary) }))
    .sort(statusThenName);

  const open = rows.filter((r) => r.status === "open").length;
  const closed = rows.filter((r) => r.status === "closed").length;
  const asleep = rows.length - open - closed;

  return (
    <main className="min-h-dvh">
      <TzDetector currentTz={user.tz} />

      <div className="mx-auto max-w-4xl px-6 py-10 md:py-14 space-y-14">
        {/* header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-accent" />
              {team.orgName}
            </span>
            <h1 className="text-5xl md:text-6xl font-medium tracking-tight leading-none">
              {team.teamName}
            </h1>
          </div>
          <div className="text-right text-xs text-muted-foreground font-mono">
            <div>{user.email}</div>
            <div className="text-muted-foreground/70">{user.tz}</div>
          </div>
        </header>

        {/* live status band */}
        <section className="border-y border-border py-4 flex items-center gap-6 text-sm">
          <StatBadge label="open" value={open} color="emerald" />
          <StatBadge label="closed" value={closed} color="zinc" />
          <StatBadge label="asleep" value={asleep} color="indigo" />
          <span className="flex-1" />
          {primary ? (
            <span className="text-xs text-muted-foreground font-mono">
              {primary.windowOpenLocal.slice(0, 5)} → {primary.windowCloseLocal.slice(0, 5)} local
            </span>
          ) : null}
        </section>

        {/* schedule */}
        <section className="space-y-4">
          <SectionHeader
            index="01"
            title="Schedule"
            right={
              isAdmin && primary ? (
                <Link
                  href={`/s/${primary.id}`}
                  className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
                >
                  Edit →
                </Link>
              ) : null
            }
          />
          {activeSchedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active schedule.{" "}
              {isAdmin && (
                <span>Create one from the schedule editor.</span>
              )}
            </p>
          ) : (
            <ul className="space-y-2">
              {activeSchedules.map((s) => (
                <li
                  key={s.id}
                  className="rounded-md border border-white/[0.06] px-5 py-4 flex items-center justify-between hover:border-white/10 transition"
                >
                  <div>
                    <p className="text-base font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {s.rrule}
                    </p>
                  </div>
                  <div className="text-right font-mono text-sm">
                    <div>
                      {s.windowOpenLocal.slice(0, 5)} → {s.windowCloseLocal.slice(0, 5)}
                    </div>
                    <div className="text-xs text-muted-foreground">local</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* timezone strip */}
        <section className="space-y-4">
          <SectionHeader
            index="02"
            title="Timezone strip"
            hint="Who's asleep, who's in their window, who's out for the day."
          />
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {rows.map((m) => (
              <li
                key={m.memberId}
                className="rounded-md border border-white/[0.06] px-4 py-3.5 hover:border-white/10 transition"
              >
                <div className="flex items-center gap-3">
                  <StatusDot status={m.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.name ?? m.email}
                      {m.userId === user.id && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                          you
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                      {m.tz}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-mono tabular-nums leading-none">
                      {localTime(now, m.tz)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                      {statusLabel(m.status)}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* invite */}
        {isAdmin && (
          <section className="space-y-4">
            <SectionHeader index="03" title="Invite teammates" />
            <form action={inviteMembers} className="space-y-2">
              <input type="hidden" name="teamId" value={team.teamId} />
              <div className="flex gap-2">
                <input
                  name="emails"
                  placeholder="alice@company.com, bob@company.com"
                  required
                  className="flex-1 h-11 rounded-md bg-white/[0.02] border border-white/10 px-4 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
                />
                <button
                  type="submit"
                  className="h-11 px-5 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 active:scale-[0.99] transition"
                >
                  Invite
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Comma, semicolon, or whitespace separated. Invitees sign in at
                <code className="mx-1 font-mono">/sign-in</code> with the same email.
              </p>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}

// ────────── helpers ──────────

type Status = "open" | "closed" | "asleep";

function memberStatus(now: Date, tz: string, s: Sched | undefined): Status {
  if (!s) return "asleep";
  const today = localDate(now, tz);
  const w = windowFor(today, s.windowOpenLocal.slice(0, 5), s.windowCloseLocal.slice(0, 5), tz);
  const status = windowStatus(now, w);
  if (status === "open") return "open";
  if (status === "closed") return "closed";
  return "asleep";
}

function statusLabel(s: Status): string {
  if (s === "open") return "window open";
  if (s === "closed") return "window closed";
  return "asleep";
}

function statusThenName(
  a: { status: Status; name: string | null; email: string },
  b: { status: Status; name: string | null; email: string },
): number {
  const order: Record<Status, number> = { open: 0, closed: 1, asleep: 2 };
  const d = order[a.status] - order[b.status];
  if (d !== 0) return d;
  return (a.name ?? a.email).localeCompare(b.name ?? b.email);
}

function localTime(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(now);
}

function SectionHeader({
  index,
  title,
  hint,
  right,
}: {
  index: string;
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-muted-foreground/70">{index}</span>
        <h2 className="text-2xl font-medium tracking-tight">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {right}
    </div>
  );
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "emerald" | "zinc" | "indigo";
}) {
  const dot =
    color === "emerald"
      ? "bg-emerald-400 shadow-[0_0_10px_theme(colors.emerald.400/.6)]"
      : color === "indigo"
        ? "bg-indigo-400"
        : "bg-zinc-500";
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={`size-2 rounded-full ${dot}`} />
      <span className="font-mono tabular-nums">{value}</span>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </span>
  );
}

function StatusDot({ status }: { status: Status }) {
  const cls =
    status === "open"
      ? "bg-emerald-400 shadow-[0_0_10px_theme(colors.emerald.400/.6)]"
      : status === "closed"
        ? "bg-zinc-500"
        : "bg-indigo-400";
  return <span className={`size-2 rounded-full ${cls}`} />;
}
