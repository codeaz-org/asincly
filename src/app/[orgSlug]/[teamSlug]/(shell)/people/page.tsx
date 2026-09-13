import { X } from "lucide-react";
import { AwayControl } from "@/components/people/away-control";
import { InviteForm } from "@/components/invite-form";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, Pill, SectionTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { createTeam, removeMember } from "@/lib/actions/team-admin";
import { railPositions } from "@/lib/day-rail";
import { displayName } from "@/lib/display";
import { dayLabel } from "@/lib/feed-view";
import { awayToday, getDayFeed, getTeamRoster } from "@/lib/queries";
import { getTeamPageContext, getViewerToday } from "@/lib/team-context";

export const metadata = { title: "People" };

const STATUS_TEXT = {
  done: "checked in",
  open: "window open",
  before: "later today",
  missed: "window closed",
  asleep: "asleep",
  away: "away",
} as const;

export default async function PeoplePage({ params }: { params: Promise<{ orgSlug: string; teamSlug: string }> }) {
  const { orgSlug, teamSlug } = await params;
  const [{ user, team }, today] = await Promise.all([
    getTeamPageContext(orgSlug, teamSlug),
    getViewerToday(orgSlug, teamSlug),
  ]);
  const [roster, entries] = await Promise.all([
    getTeamRoster(team.teamId),
    getDayFeed(team.teamId, today.todayISO, user.id),
  ]);
  const isAdmin = team.role === "owner" || team.role === "admin";
  const done = new Set(entries.map((e) => e.userId));

  const positions = railPositions(
    roster.map((m) => ({
      userId: m.userId,
      tz: m.tz,
      done: done.has(m.userId),
      away: !!awayToday(today.away, m.userId, m.tz, today.now),
    })),
    today.primary,
    today.now,
  );
  const byId = new Map(positions.map((p) => [p.userId, p]));
  // East to west: whoever's day is furthest along first.
  const offsetHours = (o: string) => {
    const [h, m] = o.slice(1).split(":").map(Number);
    return (o.startsWith("-") ? -1 : 1) * (h + m / 60);
  };
  const people = [...roster].sort(
    (a, b) =>
      offsetHours(byId.get(b.userId)!.utcOffset) - offsetHours(byId.get(a.userId)!.utcOffset) ||
      displayName(a.name, a.email).localeCompare(displayName(b.name, b.email)),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-8 md:pt-12 pb-16 space-y-10">
      <header className="space-y-2">
        <p className="kicker">{team.orgName}</p>
        <h1 className="display text-4xl sm:text-5xl text-ink">People</h1>
        <p className="text-soft">
          {roster.length} {roster.length === 1 ? "person" : "people"} in {team.teamName}, ordered by who&rsquo;s furthest into their day.
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="you">
        <SectionTitle>
          <span id="you">Your availability</span>
        </SectionTitle>
        <AwayControl
          teamId={team.teamId}
          todayISO={today.todayISO}
          current={today.away.find((a) => a.userId === user.id && a.endsOn >= today.todayISO) ?? null}
        />
      </section>

      <section className="space-y-3" aria-labelledby="team">
        <SectionTitle count={roster.length}>
          <span id="team">Team</span>
        </SectionTitle>
        <ul className="grid gap-2 sm:grid-cols-2">
          {people.map((m) => {
            const p = byId.get(m.userId)!;
            const away = today.away.find((a) => a.userId === m.userId && a.endsOn >= today.todayISO);
            const isMe = m.userId === user.id;
            return (
              <Card as="li" key={m.memberId} className="p-4 flex items-center gap-3">
                <Avatar name={m.name} email={m.email} size={42} status={p.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-ink truncate">
                    {displayName(m.name, m.email)}
                    {isMe && <span className="ml-2 kicker text-[10px]">you</span>}
                  </p>
                  <p className="text-xs text-soft truncate">
                    {STATUS_TEXT[p.status]}
                    {away && p.status === "away" && ` until ${dayLabel(away.endsOn)}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-sm tabular-nums text-ink">{p.localTime}</p>
                  <p className="text-[11px] text-soft">{p.city}</p>
                </div>
                {m.role !== "member" && <Pill tone="amber" className="shrink-0">{m.role}</Pill>}
                {m.role !== "owner" && (isAdmin || isMe) && (
                  <form action={removeMember.bind(null, m.memberId)} className="shrink-0">
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={isMe ? "Leave team" : `Remove ${displayName(m.name, m.email)}`}
                      title={isMe ? "Leave team" : "Remove from team"}
                      className="hover:text-danger"
                    >
                      <X />
                    </Button>
                  </form>
                )}
              </Card>
            );
          })}
        </ul>
      </section>

      {isAdmin && (
        <section className="space-y-3" aria-labelledby="invite">
          <SectionTitle>
            <span id="invite">Invite</span>
          </SectionTitle>
          <Card className="p-4 sm:p-5">
            <InviteForm teamId={team.teamId} />
          </Card>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="new-team-title" id="new-team">
        <SectionTitle>
          <span id="new-team-title">New team in {team.orgName}</span>
        </SectionTitle>
        <Card className="p-4 sm:p-5">
          <form action={createTeam.bind(null, team.orgId)} className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="new-team-name" className="sr-only">
              Team name
            </label>
            <Input id="new-team-name" name="name" required placeholder="Team name, e.g. Design" className="flex-1" />
            <Button type="submit" variant="secondary" size="lg">
              Create team
            </Button>
          </form>
          <p className="mt-2 text-xs text-soft">You become its owner. A weekday check-in is set up automatically.</p>
        </Card>
      </section>
    </div>
  );
}
