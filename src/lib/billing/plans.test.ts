import { describe, expect, it } from "vitest";
import {
  FREE,
  UNLIMITED,
  effectiveRetentionDays,
  entitlementsFor,
  freeSince,
  historyCutoff,
  initialBilling,
  isBillingEnabled,
  trialDaysLeft,
  type BillingState,
} from "./plans";

const now = new Date("2026-09-14T12:00:00Z");
const day = 86_400_000;
const state = (s: Partial<BillingState>): BillingState => ({
  plan: "free",
  status: "active",
  trialEndsAt: null,
  pastDueSince: null,
  ...s,
});

describe("isBillingEnabled", () => {
  it("is only on with the exact flag", () => {
    expect(isBillingEnabled({ BILLING_ENABLED: "true" })).toBe(true);
    expect(isBillingEnabled({ BILLING_ENABLED: "1" })).toBe(false);
    expect(isBillingEnabled({})).toBe(false);
  });
});

describe("entitlementsFor", () => {
  it("gives self-hosted installs everything", () => {
    expect(entitlementsFor(state({}), 50, now, false)).toBe(UNLIMITED);
  });

  it("treats an org without a billing row as Free", () => {
    expect(entitlementsFor(null, 2, now, true)).toMatchObject({ plan: "free", maxMembers: 3, maxTeams: 1 });
  });

  it("gives Pro during an active trial and Free after it ends", () => {
    const trial = state({ status: "trialing", trialEndsAt: new Date(now.getTime() + 3 * day) });
    expect(entitlementsFor(trial, 4, now, true)).toMatchObject({ plan: "pro", guests: true });
    const expired = state({ status: "trialing", trialEndsAt: new Date(now.getTime() - day) });
    expect(entitlementsFor(expired, 4, now, true)).toMatchObject({ plan: "free", status: "canceled" });
  });

  it("scales Pro AI minutes with seats", () => {
    const e = entitlementsFor(state({ plan: "pro", status: "active" }), 5, now, true);
    expect(e.aiSecondsPerMonth).toBe(5 * 600 * 60);
    expect(e.maxVideoSeconds).toBe(600);
    expect(e.historyDays).toBeNull();
  });

  it("keeps Pro for 7 days past due, then falls back to Free", () => {
    const recent = state({ plan: "pro", status: "past_due", pastDueSince: new Date(now.getTime() - 6 * day) });
    expect(entitlementsFor(recent, 3, now, true).plan).toBe("pro");
    const old = state({ plan: "pro", status: "past_due", pastDueSince: new Date(now.getTime() - 8 * day) });
    expect(entitlementsFor(old, 3, now, true).plan).toBe("free");
  });

  it("drops canceled subscriptions to Free", () => {
    expect(entitlementsFor(state({ plan: "pro", status: "canceled" }), 3, now, true)).toMatchObject({
      ...FREE,
      status: "canceled",
    });
  });
});

describe("helpers", () => {
  it("counts trial days left", () => {
    const e = entitlementsFor(state({ status: "trialing", trialEndsAt: new Date(now.getTime() + 2.5 * day) }), 1, now, true);
    expect(trialDaysLeft(e, now)).toBe(3);
    expect(trialDaysLeft(UNLIMITED, now)).toBeNull();
  });

  it("computes the history cutoff inclusively", () => {
    const free = entitlementsFor(null, 1, now, true);
    expect(historyCutoff(free, "2026-09-14")).toBe("2026-09-01");
    expect(historyCutoff(UNLIMITED, "2026-09-14")).toBeNull();
  });

  it("dates the loss of Pro from the latest ending", () => {
    const pro = state({ plan: "pro", status: "active" });
    expect(freeSince(pro, now)).toBeNull();
    const canceled = state({
      plan: "pro",
      status: "canceled",
      trialEndsAt: new Date(now.getTime() - 60 * day),
      currentPeriodEnd: new Date(now.getTime() - 5 * day),
    });
    expect(freeSince(canceled, now)).toEqual(new Date(now.getTime() - 5 * day));
  });

  it("only shortens retention for Free orgs past the grace period", () => {
    const free = entitlementsFor(null, 1, now, true);
    const longAgo = new Date(now.getTime() - 40 * day);
    const recently = new Date(now.getTime() - 10 * day);
    expect(effectiveRetentionDays(0, free, longAgo, now)).toBe(14);
    expect(effectiveRetentionDays(7, free, longAgo, now)).toBe(7);
    expect(effectiveRetentionDays(90, free, recently, now)).toBe(90);
    expect(effectiveRetentionDays(0, UNLIMITED, null, now)).toBe(0);
  });
});

describe("initialBilling", () => {
  it("starts a trial only when card payments work", () => {
    const withPay = initialBilling(now, true);
    expect(entitlementsFor({ ...withPay, pastDueSince: null }, 1, now, true).plan).toBe("pro");
    const noPay = initialBilling(now, false);
    expect(entitlementsFor({ ...noPay, pastDueSince: null }, 1, now, true).plan).toBe("free");
  });

  it("without payments, starts the video grace period now rather than deleting old videos", () => {
    const state = { ...initialBilling(now, false), pastDueSince: null };
    const since = freeSince(state, now);
    expect(since).toEqual(now);
    const e = entitlementsFor(state, 1, now, true);
    // A team keeping videos for 90 days stays at 90 during the grace period…
    expect(effectiveRetentionDays(90, e, since, now)).toBe(90);
    // …and drops to the Free window once it's over.
    expect(effectiveRetentionDays(90, e, since, new Date(now.getTime() + 31 * 86_400_000))).toBe(FREE.historyDays);
  });
});
