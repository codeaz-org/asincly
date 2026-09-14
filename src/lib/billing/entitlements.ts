import { and, countDistinct, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, members, orgBilling, teams } from "@/db/schema";
import {
  TRIAL_DAYS,
  UNLIMITED,
  billingPeriod,
  entitlementsFor,
  isBillingEnabled,
  type BillingState,
  type Entitlements,
} from "@/lib/billing/plans";

// Server-side view of what an organization's plan allows. With billing
// disabled (self-host) every function short-circuits to "unlimited" without
// touching the billing tables.

export class PlanLimitError extends Error {
  readonly upgrade = true;
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export type LimitResult = { ok: true } | { ok: false; error: string; upgrade: true };

export const limitResult = (e: unknown): LimitResult | null =>
  e instanceof PlanLimitError ? { ok: false, error: e.message, upgrade: true } : null;

// Starts a 14-day Pro trial the first time an org is seen on the cloud.
export async function ensureOrgBilling(orgId: string, now = new Date()) {
  const [existing] = await db.select().from(orgBilling).where(eq(orgBilling.orgId, orgId));
  if (existing) return existing;
  const [created] = await db
    .insert(orgBilling)
    .values({
      orgId,
      plan: "free",
      status: "trialing",
      trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 86_400_000),
    })
    .onConflictDoNothing()
    .returning();
  return created ?? (await db.select().from(orgBilling).where(eq(orgBilling.orgId, orgId)))[0];
}

// Distinct people with a non-guest role anywhere in the org.
export async function countBillableSeats(orgId: string): Promise<number> {
  const [row] = await db
    .select({ seats: countDistinct(members.userId) })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .where(and(eq(teams.orgId, orgId), ne(members.role, "guest")));
  return Number(row?.seats ?? 0);
}

type BillingRow = typeof orgBilling.$inferSelect;

export function billingState(row: BillingRow | null | undefined): BillingState | null {
  if (!row) return null;
  return {
    plan: row.plan,
    status: row.status,
    trialEndsAt: row.trialEndsAt,
    pastDueSince: row.pastDueSince,
    currentPeriodEnd: row.currentPeriodEnd,
  };
}

export async function getEntitlements(orgId: string, now = new Date()): Promise<Entitlements> {
  if (!isBillingEnabled()) return UNLIMITED;
  const [billing, seats] = await Promise.all([ensureOrgBilling(orgId, now), countBillableSeats(orgId)]);
  return entitlementsFor(billingState(billing), seats, now, true);
}

export async function getOrgIdForTeam(teamId: string): Promise<string | null> {
  const [t] = await db.select({ orgId: teams.orgId }).from(teams).where(eq(teams.id, teamId));
  return t?.orgId ?? null;
}

// ────────── Checks used by server actions ──────────

export async function assertCanAddMembers(orgId: string, newBillable: number): Promise<void> {
  if (!isBillingEnabled() || newBillable <= 0) return;
  const [e, seats] = await Promise.all([getEntitlements(orgId), countBillableSeats(orgId)]);
  if (e.maxMembers != null && seats + newBillable > e.maxMembers) {
    throw new PlanLimitError(
      `The Free plan includes up to ${e.maxMembers} members. Upgrade to Pro to add more people.`,
    );
  }
}

export async function countTeams(orgId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(teams).where(eq(teams.orgId, orgId));
  return row?.n ?? 0;
}

export async function assertCanCreateTeam(orgId: string): Promise<void> {
  if (!isBillingEnabled()) return;
  const e = await getEntitlements(orgId);
  if (e.maxTeams == null) return;
  if ((await countTeams(orgId)) >= e.maxTeams) {
    throw new PlanLimitError(`The Free plan includes ${e.maxTeams} team. Upgrade to Pro for more teams.`);
  }
}

export async function assertFeature(
  orgId: string,
  feature: "requireVideoRule" | "multipleSchedules" | "guests" | "slack",
): Promise<void> {
  if (!isBillingEnabled()) return;
  const e = await getEntitlements(orgId);
  if (!e[feature]) {
    const names = {
      requireVideoRule: "Requiring a video",
      multipleSchedules: "Multiple check-in schedules",
      guests: "Guests",
      slack: "Slack",
    } as const;
    throw new PlanLimitError(`${names[feature]} is part of Pro. Upgrade to turn it on.`);
  }
}

// ────────── AI usage ──────────

export async function aiSecondsUsed(orgId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ seconds: aiUsage.seconds })
    .from(aiUsage)
    .where(and(eq(aiUsage.orgId, orgId), eq(aiUsage.period, billingPeriod(now))));
  return row?.seconds ?? 0;
}

// Seconds of AI transcription left this month; null = unlimited.
export async function aiSecondsRemaining(orgId: string, now = new Date()): Promise<number | null> {
  if (!isBillingEnabled()) return null;
  const [e, used] = await Promise.all([getEntitlements(orgId, now), aiSecondsUsed(orgId, now)]);
  return e.aiSecondsPerMonth == null ? null : Math.max(0, e.aiSecondsPerMonth - used);
}

export async function recordAiUsage(orgId: string, seconds: number, now = new Date()): Promise<void> {
  if (!isBillingEnabled() || seconds <= 0) return;
  await db
    .insert(aiUsage)
    .values({ orgId, period: billingPeriod(now), seconds: Math.ceil(seconds) })
    .onConflictDoUpdate({
      target: [aiUsage.orgId, aiUsage.period],
      set: { seconds: sql`${aiUsage.seconds} + ${Math.ceil(seconds)}` },
    });
}

// Everything the Plan & billing page shows.
export async function getBillingOverview(orgId: string, now = new Date()) {
  // First, so a missing trial row exists before it is read below.
  const e = await getEntitlements(orgId, now);
  const [billing, seats, teamCount, aiUsed] = await Promise.all([
    db.select().from(orgBilling).where(eq(orgBilling.orgId, orgId)).then((r) => r[0] ?? null),
    countBillableSeats(orgId),
    countTeams(orgId),
    aiSecondsUsed(orgId, now),
  ]);
  return { entitlements: e, billing, seats, teamCount, aiUsed };
}
