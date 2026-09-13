import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schedules } from "@/db/schema";
import { AppShell } from "@/components/app-shell";
import { Markdown } from "@/components/markdown";
import { RecordingPlayer } from "@/components/recording-player";
import { TzDetector } from "@/components/tz-detector";
import { avatarHue, displayName, initials } from "@/lib/display";
import { extractMentions } from "@/lib/mentions";
import { getMyCheckInForOccurrence, getTeamFeed, getTeamRoster } from "@/lib/queries";
import { getTeamBySlug, requireUser } from "@/lib/session";
import { localDate, windowFor, windowStatus } from "@/lib/time";

type Sched = {
  id: string;
  name: string;
  windowOpenLocal: string;
  windowCloseLocal: string;
};

type MemberStatus = "done" | "open" | "closed" | "asleep";

export default async function TeamFeedPage({
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
        windowOpenLocal: schedules.windowOpenLocal,
        windowCloseLocal: schedules.windowCloseLocal,
      })
      .from(schedules)
      .where(and(eq(schedules.teamId, team.teamId), eq(schedules.active, true))),
    getTeamRoster(team.teamId),
  ]);

  const primary: Sched | undefined = activeSchedules[0];
  const now = new Date();
  const todayISO = localDate(now, user.tz);
  const feed = await getTeamFeed(team.teamId, todayISO);
  const myCheckIn = await getMyCheckInForOccurrence(feed.today?.occurrenceId, user.id);
  const doneUserIds = new Set(feed.today?.entries.map((e) => e.userId) ?? []);

  const memberRows = roster.map((m) => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    status: memberStatus(now, m.tz, primary, doneUserIds.has(m.userId)),
  }));
  const done = memberRows.filter((r) => r.status === "done").length;
  const open = memberRows.filter((r) => r.status === "open").length;
  const closed = memberRows.filter((r) => r.status === "closed").length;
  const asleep = memberRows.filter((r) => r.status === "asleep").length;

  const checkInHref = `/${orgSlug}/${teamSlug}/check-in`;
  const primaryCta = ctaLabel(myCheckIn);

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
      <TzDetector currentTz={user.tz} />

      <div className="mx-auto max-w-4xl px-6 py-10 md:py-12 space-y-10">
        {/* Primary CTA card */}
        {primary && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-5 py-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Today · {todayISO}
              </p>
              <p className="text-lg font-medium">{primaryCta.headline}</p>
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
        <section className="border-y border-border py-3 flex flex-wrap items-center gap-6 text-sm">
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

        {/* Today */}
        {feed.today && (
          <section className="space-y-4">
            <SectionHeader title="Today" />
            {feed.today.entries.length === 0 ? (
              <EmptyState hint="No one has checked in yet. Be the first." />
            ) : (
              <ul className="space-y-4">
                {feed.today.entries.map((e) => (
                  <CheckInCard
                    key={e.checkInId}
                    entry={e}
                    isMe={e.userId === user.id}
                    currentUserId={user.id}
                  />
                ))}
              </ul>
            )}
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
                        key={m.userId}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs"
                      >
                        <StatusDot status={m.status} />
                        {displayName(m.name, m.email)}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Recent */}
        {feed.past.length > 0 && (
          <section className="space-y-4">
            <SectionHeader title="Recent" />
            <ul className="space-y-6">
              {feed.past.map((occ) => (
                <li key={occ.occurrenceId} className="space-y-3">
                  <p className="text-xs font-mono text-muted-foreground">
                    {dayLabel(occ.scheduleDate, todayISO)} · {occ.entries.length}{" "}
                    {occ.entries.length === 1 ? "check-in" : "check-ins"}
                  </p>
                  <ul className="space-y-3">
                    {occ.entries.map((e) => (
                      <CheckInCard
                        key={e.checkInId}
                        entry={e}
                        isMe={e.userId === user.id}
                        currentUserId={user.id}
                        compact
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}

// ────────── card ──────────
import type { FeedEntry } from "@/lib/queries";

function dayLabel(iso: string, todayISO: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const t = new Date(`${todayISO}T00:00:00Z`);
  const diff = Math.round((t.getTime() - d.getTime()) / 86_400_000);
  if (diff === 1) return "yesterday";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).toLowerCase();
}

function mentionsUser(entry: FeedEntry, userId: string): boolean {
  return [entry.yesterday, entry.today, entry.blockers].some((md) =>
    extractMentions(md).some((m) => m.userId === userId),
  );
}

function CheckInCard({
  entry,
  isMe,
  currentUserId,
  compact,
}: {
  entry: FeedEntry;
  isMe: boolean;
  currentUserId: string;
  compact?: boolean;
}) {
  const name = displayName(entry.userName, entry.userEmail);
  const hue = avatarHue(name);
  const mentionsMe = !isMe && mentionsUser(entry, currentUserId);
  return (
    <li
      id={`ci-${entry.checkInId}`}
      className={`feed-card rounded-lg border ${
        isMe ? "border-accent/40 bg-accent/[0.04]" : "border-white/10 bg-white/[0.02]"
      } px-5 py-4 space-y-3 scroll-mt-24`}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden
            className="grid place-items-center size-8 rounded-full text-[10px] font-semibold shrink-0"
            style={{
              background: `oklch(0.32 0.06 ${hue} / 0.7)`,
              color: `oklch(0.88 0.06 ${hue})`,
              border: `1px solid oklch(0.6 0.1 ${hue} / 0.4)`,
            }}
          >
            {initials(entry.userName, entry.userEmail)}
          </span>
          <p className="text-sm font-medium truncate">
            {name}
            {isMe && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                you
              </span>
            )}
          </p>
          {mentionsMe && (
            <span className="shrink-0 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-200 text-[10px] px-2 py-0.5">
              mentions you
            </span>
          )}
        </div>
        <time className="text-[11px] text-muted-foreground font-mono shrink-0">
          {entry.submittedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </time>
      </header>

      {entry.recordings.length > 0 && (
        <div className="pl-3.5 space-y-2">
          {entry.recordings.map((r) => (
            <div key={r.id} className="space-y-2">
              {r.summary && r.summary.bullets.length > 0 && (
                <ul className="text-sm space-y-1">
                  {r.summary.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-accent shrink-0">→</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
              <RecordingPlayer rec={r} />
            </div>
          ))}
        </div>
      )}

      {compact ? (
        <div className="pl-3.5 space-y-2">
          {entry.today.trim() && (
            <div>
              <SectionKey>today</SectionKey>
              <Markdown currentUserId={currentUserId}>{entry.today}</Markdown>
            </div>
          )}
          {entry.blockers.trim() && (
            <div>
              <SectionKey>blockers</SectionKey>
              <Markdown currentUserId={currentUserId}>{entry.blockers}</Markdown>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-3.5">
          <div className="space-y-1">
            <SectionKey>yesterday</SectionKey>
            <Markdown currentUserId={currentUserId}>{entry.yesterday}</Markdown>
          </div>
          <div className="space-y-1">
            <SectionKey>today</SectionKey>
            <Markdown currentUserId={currentUserId}>{entry.today}</Markdown>
          </div>
          <div className="space-y-1">
            <SectionKey>blockers</SectionKey>
            <Markdown currentUserId={currentUserId}>{entry.blockers}</Markdown>
          </div>
        </div>
      )}
    </li>
  );
}

function SectionKey({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">{children}</p>
  );
}

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

function SectionHeader({ title }: { title: string }) {
  return <h2 className="text-2xl font-medium tracking-tight">{title}</h2>;
}

function EmptyState({ hint }: { hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 px-5 py-10 text-center">
      <p className="text-sm text-muted-foreground">{hint}</p>
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
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
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
