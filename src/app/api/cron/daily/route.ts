import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  checkIns,
  notifications,
  occurrences,
  orgBilling,
  recordings,
  schedules,
  sessions,
  teams,
  verificationTokens,
} from "@/db/schema";
import { billingState } from "@/lib/billing/entitlements";
import { emailOrgOwner } from "@/lib/billing/owner-email";
import {
  effectiveRetentionDays,
  entitlementsFor,
  FREE,
  FREE_PURGE_GRACE_DAYS,
  freeSince,
  isBillingEnabled,
} from "@/lib/billing/plans";
import { cronAuthorized } from "@/lib/cron-auth";
import { purgeRateLimits } from "@/lib/rate-limit";
import { deleteRecordingObjects, sweepOrphanObjects } from "@/lib/recording-objects";

// Once a day: everything that deletes data on a schedule. Each job is
// isolated so one failing doesn't skip the others, and each is idempotent,
// so a missed or doubled run is harmless.
//
// Auth: Authorization: Bearer $CRON_SECRET.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAY = 24 * 3600 * 1000;
// Stated on the privacy page.
const NOTIFICATION_DAYS = 90;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const stats: Record<string, number | string> = {};
  const run = async (name: string, job: () => Promise<number>) => {
    try {
      stats[name] = await job();
    } catch (e) {
      stats[name] = "failed";
      console.error(`[daily] ${name} failed`, e instanceof Error ? e.message : "unknown error");
    }
  };

  await run("purgedRecordings", () => purgeExpiredRecordings(now));
  await run("orphanObjects", () => sweepOrphanObjects(now));
  await run("purgedNotifications", async () => {
    const gone = await db
      .delete(notifications)
      .where(lt(notifications.createdAt, new Date(now.getTime() - NOTIFICATION_DAYS * DAY)))
      .returning({ id: notifications.id });
    return gone.length;
  });
  await run("purgedSessions", async () => {
    const gone = await db.delete(sessions).where(lt(sessions.expires, now)).returning({ t: sessions.sessionToken });
    await db.delete(verificationTokens).where(lt(verificationTokens.expires, now));
    return gone.length;
  });

  await run("purgedRateLimits", () => purgeRateLimits(now));
  if (isBillingEnabled()) await run("trialEmails", () => emailTrialOwners(now));

  const ok = !Object.values(stats).includes("failed");
  return NextResponse.json({ ok, ...stats }, { status: ok ? 200 : 500 });
}

// For each team with a non-zero retention, delete recordings older than the
// horizon — the rows, then their bucket objects. On the hosted cloud, Free
// orgs keep videos for the plan's history window (after a grace period
// following the loss of Pro).
async function purgeExpiredRecordings(now: Date): Promise<number> {
  let purged = 0;
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
    const cutoff = new Date(now.getTime() - days * DAY);
    const expired = await db
      .select({ id: recordings.id, o: recordings.objectKey, p: recordings.posterKey, a: recordings.audioKey })
      .from(recordings)
      .innerJoin(checkIns, eq(checkIns.id, recordings.checkInId))
      .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
      .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
      .where(and(eq(schedules.teamId, t.id), lt(recordings.createdAt, cutoff)));
    if (expired.length === 0) continue;
    await db.delete(recordings).where(
      inArray(
        recordings.id,
        expired.map((r) => r.id),
      ),
    );
    await deleteRecordingObjects(expired.flatMap((r) => [r.o, r.p, r.a]).filter((k): k is string => !!k));
    purged += expired.length;
  }
  return purged;
}

// The trial is ours (no card up front), so Stripe never warns anyone. Once a
// day: three days before it ends, and the day after it has. Each window is
// one day wide, so each org gets each email once.
async function emailTrialOwners(now: Date): Promise<number> {
  const at = (days: number) => new Date(now.getTime() + days * DAY);
  const [endingSoon, ended] = await Promise.all([
    db
      .select({ orgId: orgBilling.orgId, endsAt: orgBilling.trialEndsAt })
      .from(orgBilling)
      .where(and(eq(orgBilling.status, "trialing"), gte(orgBilling.trialEndsAt, at(2)), lt(orgBilling.trialEndsAt, at(3)))),
    db
      .select({ orgId: orgBilling.orgId })
      .from(orgBilling)
      .where(and(eq(orgBilling.status, "trialing"), gte(orgBilling.trialEndsAt, at(-1)), lt(orgBilling.trialEndsAt, now))),
  ]);
  for (const o of endingSoon) {
    await emailOrgOwner(
      o.orgId,
      "Your Pro trial ends in 3 days",
      `Your Asincly Pro trial ends on ${o.endsAt!.toUTCString().slice(0, 16)}. Add a card to keep Pro; otherwise you move to the Free plan (up to ${FREE.maxMembers} members, recent history). Written check-ins are kept; videos older than the Free window are deleted ${FREE_PURGE_GRACE_DAYS} days after the trial unless you upgrade.`,
    );
  }
  for (const o of ended) {
    await emailOrgOwner(
      o.orgId,
      "Your Pro trial has ended",
      `You're on the Free plan now. Videos older than the Free history window are kept for ${FREE_PURGE_GRACE_DAYS} days, then deleted; upgrading before then keeps them.`,
    );
  }
  return endingSoon.length + ended.length;
}
