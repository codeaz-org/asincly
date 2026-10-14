import { and, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { awayToday, getAwayPeriods } from "@/lib/queries";
import {
  checkIns,
  members,
  notifications,
  occurrences,
  organizations,
  schedules,
  teams,
  users,
} from "@/db/schema";
import { dayLabel } from "@/lib/feed-view";
import { cronAuthorized } from "@/lib/cron-auth";
import { notify } from "@/lib/notifications";
import { postDigestToSlack, sendSlackReminder } from "@/lib/slack/notify";
import { localDate, occursOn, windowFor, windowStatus } from "@/lib/time";

// One-shot tick called on a cron (Vercel Cron, GitHub Actions, cron on a
// self-host box, whatever). Fires window_open reminders and digest_ready
// events. Idempotent per (user, occurrence, type) — safe to run every
// 5 minutes. Retention and storage cleanup run once a day in ../daily.
//
// Auth: Authorization: Bearer $CRON_SECRET.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const stats: Stats = {
    windowOpens: 0,
    digests: 0,
    slackReminders: 0,
    slackDigests: 0,
    failedSchedules: 0,
  };
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  // Every active schedule for every team.
  const scheds = await db
    .select({
      id: schedules.id,
      teamId: schedules.teamId,
      teamName: teams.name,
      teamSlug: teams.slug,
      orgId: teams.orgId,
      orgSlug: organizations.slug,
      rrule: schedules.rrule,
      windowOpenLocal: schedules.windowOpenLocal,
      windowCloseLocal: schedules.windowCloseLocal,
    })
    .from(schedules)
    .innerJoin(teams, eq(teams.id, schedules.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(eq(schedules.active, true));

  // One schedule failing (a bad rule, a member with a broken tz) must not
  // stop reminders for every other tenant.
  for (const s of scheds) {
    try {
      await tickSchedule(s, now, stats, appUrl);
    } catch (e) {
      stats.failedSchedules++;
      console.error("[tick] schedule failed", s.id, e instanceof Error ? e.message : "unknown error");
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}

type Stats = {
  windowOpens: number;
  digests: number;
  slackReminders: number;
  slackDigests: number;
  failedSchedules: number;
};

type TickSchedule = {
  id: string;
  teamId: string;
  teamName: string;
  teamSlug: string;
  orgId: string;
  orgSlug: string;
  rrule: string;
  windowOpenLocal: string;
  windowCloseLocal: string;
};

async function tickSchedule(s: TickSchedule, now: Date, stats: Stats, appUrl: string) {
  const everyone = await db
    .select({ userId: users.id, tz: users.tz, email: users.email, role: members.role })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.teamId, s.teamId));
  // Guests read along: they get the digest but no check-in reminders.
  const teamMembers = everyone.filter((m) => m.role !== "guest");

  // Away periods for this team (still running somewhere in the world).
  const away = await getAwayPeriods(s.teamId, now);

  // ── window_open ──
  for (const m of teamMembers) {
    const today = localDate(now, m.tz);
    // The schedule's RRULE decides which local dates are standup days. Two
    // members can be on different dates at the same instant, so this is per
    // member, not per schedule.
    if (!occursOn(s.rrule, today)) continue;
    if (awayToday(away, m.userId, m.tz, now)) continue;
    const w = windowFor(
      today,
      s.windowOpenLocal.slice(0, 5),
      s.windowCloseLocal.slice(0, 5),
      m.tz,
    );
    if (windowStatus(now, w) !== "open") continue;

    // Occurrence for this schedule + local date (upsert).
    const [occ] = await db
      .insert(occurrences)
      .values({ scheduleId: s.id, scheduleDate: today })
      .onConflictDoNothing({
        target: [occurrences.scheduleId, occurrences.scheduleDate],
      })
      .returning();
    const occurrenceId =
      occ?.id ??
      (
        await db
          .select({ id: occurrences.id })
          .from(occurrences)
          .where(
            and(eq(occurrences.scheduleId, s.id), eq(occurrences.scheduleDate, today)),
          )
      )[0]?.id;
    if (!occurrenceId) continue;

    // Already submitted? Don't remind.
    const [mine] = await db
      .select({ status: checkIns.status })
      .from(checkIns)
      .where(and(eq(checkIns.occurrenceId, occurrenceId), eq(checkIns.userId, m.userId)));
    if (mine?.status === "submitted") continue;

    // Already notified this occurrence? Matched in Postgres against
    // notification_type_occurrence_idx — loading the user's whole
    // window_open history to filter in JS grew with the account.
    const [alreadyForThis] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, m.userId),
          eq(notifications.type, "window_open"),
          sql`${notifications.data} ->> 'occurrenceId' = ${occurrenceId}`,
        ),
      )
      .limit(1);
    if (alreadyForThis) continue;

    await notify({
      userId: m.userId,
      teamId: s.teamId,
      type: "window_open",
      title: `Your check-in window is open (${s.teamName})`,
      body: "Take a minute — Yesterday, Today, Blockers.",
      linkPath: `/${s.orgSlug}/${s.teamSlug}/check-in`,
      data: { occurrenceId },
    });
    stats.windowOpens++;
    const closesAt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: m.tz }).format(w.closeAt);
    if (
      await sendSlackReminder({
        teamId: s.teamId,
        orgId: s.orgId,
        email: m.email,
        teamName: s.teamName,
        closesAt,
        url: `${appUrl}/${s.orgSlug}/${s.teamSlug}/check-in`,
      })
    ) {
      stats.slackReminders++;
    }
  }

  // ── digest_ready ──
  // For each occurrence in the past 7 days that (a) has ≥1 submission and
  // (b) either every roster member has submitted, OR its window has fully
  // closed for everyone, and (c) hasn't already fired digest_ready.
  const recentCutoffISO = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const recentOccs = await db
    .select({ id: occurrences.id, scheduleDate: occurrences.scheduleDate })
    .from(occurrences)
    .where(
      and(eq(occurrences.scheduleId, s.id), gte(occurrences.scheduleDate, recentCutoffISO)),
    );

  for (const o of recentOccs) {
    const cis = await db
      .select({ userId: checkIns.userId, status: checkIns.status })
      .from(checkIns)
      .where(eq(checkIns.occurrenceId, o.id));
    const submitted = new Set(cis.filter((c) => c.status === "submitted").map((c) => c.userId));
    if (submitted.size === 0) continue;

    const allDone = teamMembers.every((m) => submitted.has(m.userId));
    const allClosed = teamMembers.every((m) => {
      const w = windowFor(
        o.scheduleDate,
        s.windowOpenLocal.slice(0, 5),
        s.windowCloseLocal.slice(0, 5),
        m.tz,
      );
      return windowStatus(now, w) === "closed";
    });
    if (!allDone && !allClosed) continue;

    // Idempotent: skip if any teammate already received digest_ready for
    // this occurrence.
    const [alreadySent] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.teamId, s.teamId),
          eq(notifications.type, "digest_ready"),
          sql`${notifications.data} ->> 'occurrenceId' = ${o.id}`,
        ),
      )
      .limit(1);
    if (alreadySent) continue;

    const linkPath = `/${s.orgSlug}/${s.teamSlug}`;
    for (const m of everyone) {
      await notify({
        userId: m.userId,
        teamId: s.teamId,
        type: "digest_ready",
        title: `Digest ready for ${s.teamName} · ${o.scheduleDate}`,
        body: `${submitted.size} of ${teamMembers.length} teammates checked in.`,
        linkPath,
        data: { occurrenceId: o.id },
        // In-app only for digest — avoids email spam. Teammates who
        // want the digest by email get the personal notifications
        // (mentioned, blocker_on_your_item, window_open).
        sendEmail: false,
      });
    }
    stats.digests++;
    if (
      await postDigestToSlack({
        teamId: s.teamId,
        orgId: s.orgId,
        occurrenceId: o.id,
        teamName: s.teamName,
        dateLabel: dayLabel(o.scheduleDate),
        url: `${appUrl}/${s.orgSlug}/${s.teamSlug}?day=${o.scheduleDate}`,
        expected: teamMembers.length,
      })
    ) {
      stats.slackDigests++;
    }
  }
}
