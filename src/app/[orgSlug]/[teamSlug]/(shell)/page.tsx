import Link from "next/link";
import { AtSign, MessageCircle } from "lucide-react";
import { cn } from "cn";
import { BlockerRow } from "@/components/dashboard/blocker-row";
import { CheckInCard } from "@/components/dashboard/check-in-card";
import { DayRail } from "@/components/dashboard/day-rail";
import { Pending, type PendingMember } from "@/components/dashboard/pending";
import { YourCard } from "@/components/dashboard/your-card";
import { PlanGate } from "@/components/billing/plan-gate";
import { LogoMark } from "@/components/brand/mark";
import { SectionTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { historyCutoff } from "@/lib/billing/plans";
import { railPositions } from "@/lib/day-rail";
import { displayName, firstName } from "@/lib/display";
import {
  blockerRows,
  dayLabel,
  mentionsUser,
  namesById,
  relativeDay,
} from "@/lib/feed-view";
import { plainText, taskStats } from "@/lib/note-items";
import { checkInDetailPath, checkInFlowPath, teamPath } from "@/lib/paths";
import { awayToday, getDayFeed, getRepliesToMe, getTeamRoster, listRecentDays } from "@/lib/queries";
import { getTeamPageContext, getTeamPlan, getViewerToday } from "@/lib/team-context";

export default async function TodayPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; teamSlug: string }>;
  searchParams: Promise<{ day?: string; focus?: string }>;
}) {
  const { orgSlug, teamSlug } = await params;
  const { day, focus } = await searchParams;
  const [{ user, team }, today, plan] = await Promise.all([
    getTeamPageContext(orgSlug, teamSlug),
    getViewerToday(orgSlug, teamSlug),
    getTeamPlan(orgSlug, teamSlug),
  ]);

  const dateISO = day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today.todayISO ? day : today.todayISO;
  const isToday = dateISO === today.todayISO;
  const root = teamPath(orgSlug, teamSlug);

  // Free plan: days older than the history window stay stored but locked.
  const cutoff = historyCutoff(plan, today.todayISO);
  if (cutoff && dateISO < cutoff) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-8 md:pt-12 pb-16 space-y-8">
        <header className="space-y-2">
          <p className="kicker">{dayLabel(dateISO, "long")}</p>
          <h1 className="display text-[2.1rem] sm:text-5xl text-ink">Older check-ins</h1>
        </header>
        <PlanGate
          title={`The Free plan shows the last ${plan.historyDays} days.`}
          hint="Nothing is deleted. Upgrade to Pro to see your team's full history again."
          href={`${root}/settings/billing`}
          canUpgrade={team.role === "owner"}
        />
        <p className="text-center text-xs text-soft">
          <Link href={root} className="hover:text-ink transition">
            ← Back to today
          </Link>
        </p>
      </div>
    );
  }

  const [roster, entries, days, replies] = await Promise.all([
    getTeamRoster(team.teamId),
    getDayFeed(team.teamId, dateISO, user.id),
    listRecentDays(team.teamId, today.todayISO),
    isToday ? getRepliesToMe(team.teamId, user.id, new Date(today.now.getTime() - 24 * 3600 * 1000)) : Promise.resolve([]),
  ]);

  const names = namesById(roster);
  const doneIds = new Set(entries.map((e) => e.userId));

  // ── Rail + pending (today only) ──
  const railMembers = roster.map((m) => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    tz: m.tz,
    done: doneIds.has(m.userId),
    away: !!awayToday(today.away, m.userId, m.tz, today.now),
  }));
  const positions = railPositions(railMembers, today.primary, today.now);
  const rosterById = new Map(roster.map((r) => [r.userId, r]));
  const pending: PendingMember[] = positions
    .filter((p) => p.status !== "done" && p.userId !== user.id)
    .sort((a, b) => ["open", "before", "missed", "asleep", "away"].indexOf(a.status) - ["open", "before", "missed", "asleep", "away"].indexOf(b.status))
    .map((p) => {
      const r = rosterById.get(p.userId)!;
      return {
        userId: p.userId,
        name: displayName(r.name, r.email),
        rawName: r.name,
        email: r.email,
        status: p.status,
        localTime: p.localTime,
        city: p.city,
      };
    });

  // ── Digest line ──
  const openBlockers = entries.flatMap((e) =>
    blockerRows(e, user.id, names).filter((b) => !b.resolved),
  );
  const tasks = entries.reduce((n, e) => n + taskStats(e.today).total, 0);
  const videos = entries.reduce((n, e) => n + e.recordings.length, 0);
  const digest = [
    openBlockers.length > 0 && `${openBlockers.length} open blocker${openBlockers.length > 1 ? "s" : ""}`,
    tasks > 0 && `${tasks} task${tasks > 1 ? "s" : ""} planned`,
    videos > 0 && `${videos} video${videos > 1 ? "s" : ""}`,
  ].filter(Boolean) as string[];

  // ── Needs attention ──
  // Blocker mentions already appear as blocker rows above.
  const mentionedMe = entries.filter(
    (e) => e.userId !== user.id && mentionsUser({ ...e, blockers: "" }, user.id),
  );
  const attentionBlockers = [...openBlockers].sort(
    (a, b) => Number(b.mentionsViewer) - Number(a.mentionsViewer) || Number(b.viewerIsAuthor) - Number(a.viewerIsAuthor),
  );
  const hasAttention = attentionBlockers.length > 0 || mentionedMe.length > 0 || replies.length > 0;

  const orderedEntries = [...entries].sort((a, b) => Number(b.userId === user.id) - Number(a.userId === user.id));
  const headline = isToday
    ? roster.length === 1
      ? entries.length === 1
        ? "You're checked in."
        : "Just you, for now."
      : `${entries.length} of ${roster.length} checked in`
    : `${entries.length} check-in${entries.length === 1 ? "" : "s"}`;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-8 md:pt-12 pb-16 space-y-10">
      <header className="space-y-5">
        <div className="space-y-2">
          <p className="kicker">
            {isToday ? "Today" : relativeDay(dateISO, today.todayISO)} · {dayLabel(dateISO, "long")}
          </p>
          <h1 className="display text-[2.1rem] sm:text-5xl text-ink">{headline}</h1>
          {digest.length > 0 && <p className="text-soft">{digest.join(" · ")}</p>}
        </div>
        <DaySwitcher days={days} todayISO={today.todayISO} current={dateISO} root={root} />
      </header>

      {isToday && (
        <>
          <DayRail
            members={railMembers}
            schedule={today.primary}
            nowISO={today.now.toISOString()}
            viewerId={user.id}
          />
          <YourCard
            mine={today.mine}
            state={today.markState}
            schedule={today.primary}
            away={today.myAway}
            checkInHref={checkInFlowPath(orgSlug, teamSlug)}
            viewerTz={user.tz}
          />
        </>
      )}

      {hasAttention && (
        <section className="space-y-3" aria-labelledby="attention">
          <SectionTitle>
            <span id="attention">Needs attention</span>
          </SectionTitle>
          <div className="rounded-2xl border border-danger/20 bg-danger/[0.03] px-4 sm:px-5 py-1 divide-y divide-line">
            {attentionBlockers.map((b) => (
              <BlockerRow key={`${b.checkInId}-${b.itemKey}`} data={b} readOnly={!isToday && !b.viewerIsAuthor} />
            ))}
            {mentionedMe.map((e) => (
              <Link
                key={`m-${e.checkInId}`}
                href={checkInDetailPath(orgSlug, teamSlug, e.checkInId)}
                className="flex items-center gap-3 py-3 text-sm text-ink hover:text-amber transition"
              >
                <span className="grid place-items-center size-6 rounded-full bg-amber/[0.14] text-amber shrink-0">
                  <AtSign className="size-3.5" />
                </span>
                <span className="flex-1">
                  <span className="font-medium">{firstName(e.userName, e.userEmail)}</span> mentioned you
                </span>
              </Link>
            ))}
            {replies.map((r) => (
              <Link
                key={r.commentId}
                href={checkInDetailPath(orgSlug, teamSlug, r.checkInId)}
                className="flex items-center gap-3 py-3 text-sm text-ink hover:text-amber transition"
              >
                <span className="grid place-items-center size-6 rounded-full bg-ink/[0.06] text-soft shrink-0">
                  <MessageCircle className="size-3.5" />
                </span>
                <span className="flex-1 min-w-0 truncate">
                  <span className="font-medium">{firstName(r.authorName, r.authorEmail)}</span> replied:{" "}
                  <span className="text-soft">{plainText(r.body)}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4" aria-labelledby="feed">
        <SectionTitle count={entries.length}>
          <span id="feed">{isToday ? "Check-ins" : `Check-ins · ${dayLabel(dateISO)}`}</span>
        </SectionTitle>
        {orderedEntries.length === 0 ? (
          <Empty
            state={isToday ? "before" : "missed"}
            title={isToday ? "Nobody's checked in yet." : "No check-ins that day."}
            hint={isToday ? "Mornings arrive one time zone at a time. Yours could be first." : undefined}
          />
        ) : (
          <div className="space-y-4">
            {orderedEntries.map((e) => (
              <CheckInCard
                key={e.checkInId}
                entry={e}
                viewerId={user.id}
                names={names}
                focus={focus === e.checkInId}
                viewerCanManage={team.role !== "member"}
                detailHref={checkInDetailPath(orgSlug, teamSlug, e.checkInId)}
              />
            ))}
          </div>
        )}
      </section>

      {isToday && pending.length > 0 && (
        <section className="space-y-3" aria-labelledby="pending">
          <SectionTitle count={pending.length}>
            <span id="pending">Not in yet</span>
          </SectionTitle>
          <Pending teamId={team.teamId} members={pending} />
        </section>
      )}

      {isToday && roster.length === 1 && (
        <Empty
          state="open"
          title="Standups need a team."
          hint="Invite people and they'll show up on the rail in their own time zone."
          action={
            <Link href={`${root}/people`} className="text-sm text-amber hover:underline underline-offset-4">
              Invite teammates →
            </Link>
          }
        />
      )}

      {entries.length > 0 && !isToday && (
        <p className="text-center text-xs text-soft">
          <Link href={root} className="hover:text-ink transition">
            ← Back to today
          </Link>
        </p>
      )}
    </div>
  );
}

function DaySwitcher({
  days,
  todayISO,
  current,
  root,
}: {
  days: Array<{ date: string; count: number }>;
  todayISO: string;
  current: string;
  root: string;
}) {
  const list = [{ date: todayISO, count: days.find((d) => d.date === todayISO)?.count ?? 0 }, ...days.filter((d) => d.date !== todayISO)].slice(0, 10);
  if (list.length <= 1) return null;
  return (
    <nav aria-label="Days" className="-mx-4 sm:mx-0 overflow-x-auto [scrollbar-width:none]">
      <ul className="flex gap-1.5 px-4 sm:px-0 w-max">
        {list.map((d) => {
          const active = d.date === current;
          return (
            <li key={d.date}>
              <Link
                href={d.date === todayISO ? root : `${root}?day=${d.date}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 h-9 rounded-full border px-3.5 text-sm transition whitespace-nowrap",
                  active ? "border-amber/50 bg-amber/[0.1] text-ink" : "border-line text-soft hover:text-ink hover:border-line-strong",
                )}
              >
                {d.date === todayISO && <LogoMark size={12} state={active ? "open" : "before"} className="text-ink" />}
                {relativeDay(d.date, todayISO)}
                {d.count > 0 && <span className="text-xs text-faint tabular-nums">{d.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
