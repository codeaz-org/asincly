// Asincly Cloud plans. Single source of truth for prices and limits: the app,
// the pricing page and the Stripe setup script all read from here.
//
// Plans only exist when BILLING_ENABLED=true (the hosted cloud). Self-hosted
// installs get `UNLIMITED` — every feature, no license checks.

export type PlanId = "free" | "pro";
export type BillingStatus = "trialing" | "active" | "past_due" | "canceled";

export const CURRENCY = "eur";
export const PRICE_PER_MEMBER = { month: 800, year: 8000 } as const; // minor units (cents)
export const TRIAL_DAYS = 14;
export const PAST_DUE_GRACE_DAYS = 7;
// After losing Pro, videos older than the Free history window are kept this
// long before the retention job removes them, so an upgrade restores them.
export const FREE_PURGE_GRACE_DAYS = 30;
export const STRIPE_LOOKUP_KEYS = { month: "asincly_pro_member_monthly", year: "asincly_pro_member_yearly" } as const;

export type Entitlements = {
  /** "unlimited" = self-host (billing disabled). */
  plan: PlanId | "unlimited";
  /** Effective status used for UI copy. */
  status: BillingStatus | "self_hosted";
  trialEndsAt: Date | null;
  /** Billable members (owner/admin/member); null = no cap. */
  maxMembers: number | null;
  maxTeams: number | null;
  /** AI transcription seconds per calendar month for the whole org; null = no cap. */
  aiSecondsPerMonth: number | null;
  maxVideoSeconds: number;
  /** Days of history (feed + recordings) visible and kept; null = team setting. */
  historyDays: number | null;
  requireVideoRule: boolean;
  multipleSchedules: boolean;
  guests: boolean;
  slack: boolean;
};

const PRO_AI_SECONDS_PER_MEMBER = 600 * 60;

export const FREE: Omit<Entitlements, "status" | "trialEndsAt"> = {
  plan: "free",
  maxMembers: 3,
  maxTeams: 1,
  aiSecondsPerMonth: 30 * 60,
  maxVideoSeconds: 3 * 60,
  historyDays: 14,
  requireVideoRule: false,
  multipleSchedules: false,
  guests: false,
  slack: false,
};

function pro(seats: number): Omit<Entitlements, "status" | "trialEndsAt"> {
  return {
    plan: "pro",
    maxMembers: null,
    maxTeams: null,
    aiSecondsPerMonth: Math.max(1, seats) * PRO_AI_SECONDS_PER_MEMBER,
    maxVideoSeconds: 10 * 60,
    historyDays: null,
    requireVideoRule: true,
    multipleSchedules: true,
    guests: true,
    slack: true,
  };
}

export const UNLIMITED: Entitlements = {
  plan: "unlimited",
  status: "self_hosted",
  trialEndsAt: null,
  maxMembers: null,
  maxTeams: null,
  aiSecondsPerMonth: null,
  maxVideoSeconds: 10 * 60,
  historyDays: null,
  requireVideoRule: true,
  multipleSchedules: true,
  guests: true,
  slack: true,
};

export function isBillingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.BILLING_ENABLED === "true";
}

export type BillingState = {
  plan: PlanId;
  status: BillingStatus;
  trialEndsAt: Date | null;
  pastDueSince: Date | null;
  currentPeriodEnd?: Date | null;
};

// What an organization may do right now.
//   trialing (not expired)          → Pro
//   active Pro subscription         → Pro
//   past_due within the grace days  → Pro, then Free
//   anything else / no row          → Free
export function entitlementsFor(
  state: BillingState | null,
  seats: number,
  now: Date,
  billingEnabled: boolean,
): Entitlements {
  if (!billingEnabled) return UNLIMITED;
  if (!state) return { ...FREE, status: "active", trialEndsAt: null };

  const trialActive = state.status === "trialing" && !!state.trialEndsAt && state.trialEndsAt > now;
  const paid = state.plan === "pro" && state.status === "active";
  const inGrace =
    state.plan === "pro" &&
    state.status === "past_due" &&
    !!state.pastDueSince &&
    now.getTime() - state.pastDueSince.getTime() < PAST_DUE_GRACE_DAYS * 86_400_000;

  const base = trialActive || paid || inGrace ? pro(seats) : FREE;
  const status: BillingStatus =
    state.status === "trialing" && !trialActive ? "canceled" : state.status;
  return { ...base, status, trialEndsAt: state.trialEndsAt };
}

// When the org last had Pro, or null if it still has it.
export function freeSince(state: BillingState | null, now: Date): Date | null {
  if (!state) return new Date(0);
  if (entitlementsFor(state, 1, now, true).plan === "pro") return null;
  const ends = [
    state.trialEndsAt,
    state.currentPeriodEnd ?? null,
    state.pastDueSince ? new Date(state.pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000) : null,
  ].filter((d): d is Date => d != null && d <= now);
  return ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : new Date(0);
}

// Days of recordings the retention job keeps for a team (0 = forever).
export function effectiveRetentionDays(teamDays: number, e: Entitlements, since: Date | null, now: Date): number {
  if (e.historyDays == null || since == null) return teamDays;
  if (now.getTime() - since.getTime() < FREE_PURGE_GRACE_DAYS * 86_400_000) return teamDays;
  return teamDays > 0 ? Math.min(teamDays, e.historyDays) : e.historyDays;
}

export function trialDaysLeft(e: Entitlements, now: Date): number | null {
  if (e.status !== "trialing" || !e.trialEndsAt) return null;
  return Math.max(0, Math.ceil((e.trialEndsAt.getTime() - now.getTime()) / 86_400_000));
}

// Oldest visible schedule date (yyyy-MM-dd) for a plan, or null for no limit.
export function historyCutoff(e: Entitlements, todayISO: string): string | null {
  if (e.historyDays == null) return null;
  const d = new Date(`${todayISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (e.historyDays - 1));
  return d.toISOString().slice(0, 10);
}

export function billingPeriod(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export function formatPrice(minor: number): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 }).format(
    minor / 100,
  );
}
