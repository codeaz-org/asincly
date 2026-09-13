import type Stripe from "stripe";

// Minimal Stripe objects for tests; only the fields our code reads.
export const periodEnd = Math.floor(new Date("2026-10-14T12:00:00Z").getTime() / 1000);

export function fakeSubscription(over: Partial<Record<string, unknown>> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    object: "subscription",
    customer: "cus_123",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: {},
    items: {
      object: "list",
      data: [{ id: "si_1", quantity: 4, current_period_end: periodEnd, price: { recurring: { interval: "month" } } }],
    },
    ...over,
  } as unknown as Stripe.Subscription;
}
