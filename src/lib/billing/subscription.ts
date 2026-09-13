import type Stripe from "stripe";
import type { BillingStatus, PlanId } from "@/lib/billing/plans";

export type BillingPatch = {
  plan: PlanId;
  status: BillingStatus;
  stripeSubscriptionId: string | null;
  interval: string | null;
  seats: number;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  pastDueSince: Date | null;
};

type Prev = { pastDueSince: Date | null } | null;

// Maps a Stripe subscription onto our org_billing columns.
//   active / trialing           → Pro active
//   past_due / unpaid           → Pro past_due (grace starts at the first failure)
//   canceled / expired / paused → Free canceled
//   incomplete                  → null: nothing granted until the first payment lands
export function billingFromSubscription(sub: Stripe.Subscription, prev: Prev, now: Date): BillingPatch | null {
  const item = sub.items.data[0];
  const base = {
    stripeSubscriptionId: sub.id,
    interval: item?.price.recurring?.interval ?? null,
    seats: item?.quantity ?? 0,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at != null,
  };
  switch (sub.status) {
    case "active":
    case "trialing":
      return { ...base, plan: "pro", status: "active", pastDueSince: null };
    case "past_due":
    case "unpaid":
      return { ...base, plan: "pro", status: "past_due", pastDueSince: prev?.pastDueSince ?? now };
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return { ...base, plan: "free", status: "canceled", pastDueSince: null, cancelAtPeriodEnd: false };
    default:
      return null;
  }
}

export function customerId(c: string | { id: string } | null | undefined): string | null {
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const s = invoice.parent?.subscription_details?.subscription;
  if (!s) return null;
  return typeof s === "string" ? s : s.id;
}
