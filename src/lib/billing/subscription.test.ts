import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { billingFromSubscription, invoiceSubscriptionId } from "./subscription";
import { fakeSubscription, periodEnd } from "./test-fixtures";

const now = new Date("2026-09-14T12:00:00Z");

describe("billingFromSubscription", () => {
  it("maps an active subscription to Pro with seats and period end", () => {
    expect(billingFromSubscription(fakeSubscription(), null, now)).toEqual({
      plan: "pro",
      status: "active",
      stripeSubscriptionId: "sub_123",
      interval: "month",
      seats: 4,
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: false,
      pastDueSince: null,
    });
  });

  it("starts the grace period at the first failure and keeps it", () => {
    const first = billingFromSubscription(fakeSubscription({ status: "past_due" }), { pastDueSince: null }, now);
    expect(first).toMatchObject({ plan: "pro", status: "past_due", pastDueSince: now });
    const earlier = new Date("2026-09-10T00:00:00Z");
    const again = billingFromSubscription(fakeSubscription({ status: "unpaid" }), { pastDueSince: earlier }, now);
    expect(again?.pastDueSince).toEqual(earlier);
  });

  it("flags scheduled cancellations and drops ended ones to Free", () => {
    expect(billingFromSubscription(fakeSubscription({ cancel_at: periodEnd }), null, now)?.cancelAtPeriodEnd).toBe(true);
    expect(billingFromSubscription(fakeSubscription({ status: "canceled" }), null, now)).toMatchObject({
      plan: "free",
      status: "canceled",
    });
  });

  it("grants nothing for an incomplete subscription", () => {
    expect(billingFromSubscription(fakeSubscription({ status: "incomplete" }), null, now)).toBeNull();
  });
});

describe("invoiceSubscriptionId", () => {
  it("reads the subscription from the invoice parent", () => {
    const inv = { parent: { subscription_details: { subscription: "sub_9" } } } as unknown as Stripe.Invoice;
    expect(invoiceSubscriptionId(inv)).toBe("sub_9");
    expect(invoiceSubscriptionId({ parent: null } as unknown as Stripe.Invoice)).toBeNull();
  });
});
