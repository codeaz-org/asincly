import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { awayToday, getAwayPeriods } from "@/lib/queries";
import {
  checkIns,
  members,
  notifications,
  occurrences,
  organizations,
  recordings,
  schedules,
  teams,
  orgBilling,
  users,
} from "@/db/schema";
import { billingState } from "@/lib/billing/entitlements";
import { effectiveRetentionDays, entitlementsFor, freeSince, isBillingEnabled } from "@/lib/billing/plans";
import { notify } from "@/lib/notifications";
import { localDate, windowFor, windowStatus } from "@/lib/time";

// One-shot tick called on a cron (Vercel Cron, GitHub Actions, cron on a
// self-host box, whatever). Fires window_open reminders and digest_ready
// events. Idempotent per (user, occurrence, type) — safe to run every
// 5 minutes.
//
// Auth: CRON_SECRET must match ?secret= or the Authorization header.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const passed =
    url.searchParams.get("secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!secret || passed !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const stats = { windowOpens: 0, digests: 0, purgedRecordings: 0 };

  // ── recording retention purge ──
  // For each team with a non-zero retention, delete recording rows older
  // than the horizon. Bucket objects orphan on purpose (fast row delete);
  // an S3 lifecycle rule on the bucket cleans them, or a separate sweeper.
  // On the hosted cloud, Free orgs keep videos for the plan's history window
  // (after a grace period following the loss of Pro).
  const billing = isBillingEnabled();
  const teamsWithRetention = await db
    .select({ id: teams.id, days: teams.recordingRetentionDays, billing: orgBilling })
    .from(teams)
    .leftJoin(orgBilling, eq(orgBilling.orgId, teams.orgId));
  for (const t of teamsWithRetention) {
    let days = t.days;
    // Orgs without a billing row yet get their trial on next visit; never purge them early.
    if (billing && t.billing) {
      const state = billingState(t.billing);
      days = effectiveRetentionDays(t.days, entitlementsFor(state, 1, now, true), freeSince(state, now), now);
    }
    if (days <= 0) continue;
    const cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000);
    // Two-step: find recording IDs belonging to this team older than cutoff.
    const candidates = await db
      .select({ id: recordings.id })
      .from(recordings)
      .innerJoin(checkIns, eq(checkIns.id, recordings.checkInId))
      .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
      .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
      .where(and(eq(schedules.teamId, t.id), lt(recordings.createdAt, cutoff)));
    if (candidates.length > 0) {
      await db
        .delete(recordings)
        .where(
          inArray(
            recordings.id,
            candidates.map((c) => c.id),
          ),
        );
      stats.purgedRecordings += candidates.length;
    }
  }

  // Every active schedule for every team.
  const scheds = await db
    .select({
      id: schedules.id,
      teamId: schedules.teamId,
      teamName: teams.name,
      teamSlug: teams.slug,
      orgSlug: organizations.slug,
      windowOpenLocal: schedules.windowOpenLocal,
      windowCloseLocal: schedules.windowCloseLocal,
    })
    .from(schedules)
    .innerJoin(teams, eq(teams.id, schedules.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(eq(schedules.active, true));

  for (const s of scheds) {
    const teamMembers = await db
      .select({ userId: users.id, tz: users.tz, email: users.email })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(eq(members.teamId, s.teamId));

    // Away periods for this team (still running somewhere in the world).
    const away = await getAwayPeriods(s.teamId, now);

    // ── window_open ──
    for (const m of teamMembers) {
      const today = localDate(now, m.tz);
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

      // Already notified this occurrence?
      const hits = await db
        .select({ data: notifications.data })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, m.userId),
            eq(notifications.type, "window_open"),
          ),
        );
      const alreadyForThis = hits.some(
        (h) => (h.data as { occurrenceId?: string } | null)?.occurrenceId === occurrenceId,
      );
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
      const digestHits = await db
        .select({ data: notifications.data })
        .from(notifications)
        .where(
          and(
            eq(notifications.teamId, s.teamId),
            eq(notifications.type, "digest_ready"),
          ),
        );
      const alreadySent = digestHits.some(
        (h) => (h.data as { occurrenceId?: string } | null)?.occurrenceId === o.id,
      );
      if (alreadySent) continue;

      const linkPath = `/${s.orgSlug}/${s.teamSlug}`;
      for (const m of teamMembers) {
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
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}
