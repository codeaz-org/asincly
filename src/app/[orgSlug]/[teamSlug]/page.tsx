import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schedules } from "@/db/schema";
import { InviteForm } from "@/components/invite-form";
import { Markdown } from "@/components/markdown";
import { TzDetector } from "@/components/tz-detector";
import { getMyCheckInForOccurrence, getTeamFeed, getTeamRoster } from "@/lib/queries";
import { getTeamBySlug, requireUser } from "@/lib/session";
import { localDate, windowFor, windowStatus } from "@/lib/time";

type Sched = {
  id: string;
  name: string;
  rrule: string;
  windowOpenLocal: string;
  windowCloseLocal: string;
};

type MemberStatus = "done" | "open" | "closed" | "asleep";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ orgSlug: string; teamSlug: string }>;
}) {
  const { orgSlug, teamSlug } = await params;
  const user = await requireUser();
  const team = await getTeamBySlug(user.id, teamSlug);
  if (!team) notFound();

  const [activeSchedules, roster] = await Promise.all([
    db
      .select({
        id: schedules.id,
        name: schedules.name,
        rrule: schedules.rrule,
        windowOpenLocal: schedules.windowOpenLocal,
        windowCloseLocal: schedules.windowCloseLocal,
      })
      .from(schedules)
      .where(and(eq(schedules.teamId, team.teamId), eq(schedules.active, true))),
    getTeamRoster(team.teamId),
  ]);

  const primary: Sched | undefined = activeSchedules[0];
  const isAdmin = team.role === "owner" || team.role === "admin";

  const now = new Date();
  const todayISO = localDate(now, user.tz);

  const feed = await getTeamFeed(team.teamId, todayISO);
  const myCheckIn = await getMyCheckInForOccurrence(feed.today?.occurrenceId, user.id);

  const doneUserIds = new Set(feed.today?.entries.map((e) => e.userId) ?? []);

  const memberRows = roster
    .map((m) => ({
      ...m,
      status: memberStatus(now, m.tz, primary, doneUserIds.has(m.userId)),
    }))
    .sort(statusThenName);

  const done = memberRows.filter((r) => r.status === "done").length;
  const open = memberRows.filter((r) => r.status === "open").length;
  const closed = memberRows.filter((r) => r.status === "closed").length;
  const asleep = memberRows.filter((r) => r.status === "asleep").length;

  const checkInHref = `/${orgSlug}/${teamSlug}/check-in`;
  const primaryCta = ctaLabel(myCheckIn);

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

        {/* Primary CTA */}
        {primary && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-5 py-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Today · {todayISO}
              </p>
              <p className="text-lg font-medium">
                {primaryCta.headline}
              </p>
              <p className="text-xs text-muted-foreground">{primaryCta.hint}</p>
            </div>
            <Link
              href={checkInHref}
              className="h-11 px-5 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 active:scale-[0.99] transition inline-flex items-center gap-2"
            >
              {primaryCta.button} →
            </Link>
          </div>
        )}

        {/* live status band */}
        <section className="border-y border-border py-4 flex flex-wrap items-center gap-6 text-sm">
          <StatBadge label="done" value={done} color="emerald" />
          <StatBadge label="open" value={open} color="amber" />
          <StatBadge label="closed" value={closed} color="zinc" />
          <StatBadge label="asleep" value={asleep} color="indigo" />
          <span className="flex-1" />
          {primary ? (
            <span className="text-xs text-muted-foreground font-mono">
              {primary.windowOpenLocal.slice(0, 5)} → {primary.windowCloseLocal.slice(0, 5)} local
            </span>
          ) : null}
        </section>

        {/* Today's feed */}
        {feed.today && (
          <section className="space-y-5">
            <SectionHeader index="01" title="Today" hint={feed.today.scheduleDate} />

            {feed.today.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No check-ins yet. Be the first.
              </p>
            ) : (
              <ul className="space-y-4">
                {feed.today.entries.map((e) => (
                  <CheckInCard key={e.checkInId} entry={e} isMe={e.userId === user.id} />
                ))}
              </ul>
            )}

            {/* pending */}
            {memberRows.some((m) => m.status !== "done") && (
              <div className="pt-2">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                  Pending
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {memberRows
                    .filter((m) => m.status !== "done")
                    .map((m) => (
                      <span
                        key={m.memberId}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs"
                      >
                        <StatusDot status={m.status} />
                        {m.name ?? m.email}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Past occurrences */}
        {feed.past.length > 0 && (
          <section className="space-y-5">
            <SectionHeader index="02" title="Recent" />
            <ul className="space-y-6">
              {feed.past.map((occ) => (
                <li key={occ.occurrenceId} className="space-y-3">
                  <p className="text-xs font-mono text-muted-foreground">
                    {occ.scheduleDate} · {occ.entries.length}{" "}
                    {occ.entries.length === 1 ? "check-in" : "check-ins"}
                  </p>
                  <ul className="space-y-3">
                    {occ.entries.map((e) => (
                      <CheckInCard key={e.checkInId} entry={e} isMe={e.userId === user.id} compact />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Team roster */}
        <section className="space-y-4">
          <SectionHeader index="03" title="Team" />
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {memberRows.map((m) => (
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

        {/* Schedule (compact) */}
        <section className="space-y-4">
          <SectionHeader
            index="04"
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
            <p className="text-sm text-muted-foreground">No active schedule.</p>
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

        {/* Invite */}
        {isAdmin && (
          <section className="space-y-4">
            <SectionHeader index="05" title="Invite teammates" hint="Optional." />
            <InviteForm teamId={team.teamId} />
          </section>
        )}
      </div>
    </main>
  );
}

// ────────── card ──────────

import type { FeedEntry } from "@/lib/queries";

function CheckInCard({
  entry,
  isMe,
  compact,
}: {
  entry: FeedEntry;
  isMe: boolean;
  compact?: boolean;
}) {
  return (
    <li
      className={`rounded-lg border ${
        isMe ? "border-accent/40 bg-accent/[0.04]" : "border-white/10 bg-white/[0.02]"
      } px-5 py-4 space-y-3`}
    >
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_theme(colors.emerald.400/.6)] mt-1.5 self-center" />
          <p className="text-sm font-medium truncate">
            {entry.userName ?? entry.userEmail}
            {isMe && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                you
              </span>
            )}
          </p>
        </div>
        <time className="text-[11px] text-muted-foreground font-mono shrink-0">
          {entry.submittedAt.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </header>

      {compact ? (
        <div className="pl-3.5 space-y-2">
          {entry.today.trim() && (
            <div>
              <SectionKey>today</SectionKey>
              <Markdown>{entry.today}</Markdown>
            </div>
          )}
          {entry.blockers.trim() && (
            <div>
              <SectionKey>blockers</SectionKey>
              <Markdown>{entry.blockers}</Markdown>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-3.5">
          <div className="space-y-1">
            <SectionKey>yesterday</SectionKey>
            <Markdown>{entry.yesterday}</Markdown>
          </div>
          <div className="space-y-1">
            <SectionKey>today</SectionKey>
            <Markdown>{entry.today}</Markdown>
          </div>
          <div className="space-y-1">
            <SectionKey>blockers</SectionKey>
            <Markdown>{entry.blockers}</Markdown>
          </div>
        </div>
      )}
    </li>
  );
}

function SectionKey({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
      {children}
    </p>
  );
}

// ────────── helpers ──────────

function memberStatus(
  now: Date,
  tz: string,
  s: Sched | undefined,
  done: boolean,
): MemberStatus {
  if (done) return "done";
  if (!s) return "asleep";
  const today = localDate(now, tz);
  const w = windowFor(today, s.windowOpenLocal.slice(0, 5), s.windowCloseLocal.slice(0, 5), tz);
  const status = windowStatus(now, w);
  if (status === "open") return "open";
  if (status === "closed") return "closed";
  return "asleep";
}

function statusLabel(s: MemberStatus): string {
  if (s === "done") return "done";
  if (s === "open") return "window open";
  if (s === "closed") return "window closed";
  return "asleep";
}

function statusThenName(
  a: { status: MemberStatus; name: string | null; email: string },
  b: { status: MemberStatus; name: string | null; email: string },
): number {
  const order: Record<MemberStatus, number> = { done: 0, open: 1, closed: 2, asleep: 3 };
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

function ctaLabel(mine: { status: "draft" | "submitted"; hasContent: boolean } | null): {
  headline: string;
  hint: string;
  button: string;
} {
  if (!mine) {
    return {
      headline: "You haven't checked in yet.",
      hint: "Takes a minute. Yesterday, today, blockers.",
      button: "Check in",
    };
  }
  if (mine.status === "submitted") {
    return {
      headline: "You're in ✓",
      hint: "You can update your check-in for the rest of the day.",
      button: "Update",
    };
  }
  if (mine.hasContent) {
    return {
      headline: "You've got a draft.",
      hint: "Autosaved. Finish it and submit.",
      button: "Continue draft",
    };
  }
  return {
    headline: "You haven't checked in yet.",
    hint: "Takes a minute. Yesterday, today, blockers.",
    button: "Check in",
  };
}

// ────────── status pieces ──────────

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
        {hint && <span className="text-xs text-muted-foreground font-mono">{hint}</span>}
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
  color: "emerald" | "amber" | "zinc" | "indigo";
}) {
  const dot =
    color === "emerald"
      ? "bg-emerald-400 shadow-[0_0_10px_theme(colors.emerald.400/.6)]"
      : color === "amber"
        ? "bg-amber-400 shadow-[0_0_10px_theme(colors.amber.400/.5)]"
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

function StatusDot({ status }: { status: MemberStatus }) {
  const cls =
    status === "done"
      ? "bg-emerald-400 shadow-[0_0_10px_theme(colors.emerald.400/.6)]"
      : status === "open"
        ? "bg-amber-400 shadow-[0_0_8px_theme(colors.amber.400/.5)]"
        : status === "closed"
          ? "bg-zinc-500"
          : "bg-indigo-400";
  return <span className={`size-2 rounded-full ${cls}`} />;
}
