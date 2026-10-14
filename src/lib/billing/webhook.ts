import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { orgBilling, stripeEvents } from "@/db/schema";
import { audit } from "@/lib/audit";
import { emailOrgOwner } from "@/lib/billing/owner-email";
import { FREE_PURGE_GRACE_DAYS, PAST_DUE_GRACE_DAYS } from "@/lib/billing/plans";
import { syncSeats } from "@/lib/billing/seats";
import { getStripe } from "@/lib/billing/stripe";
import { billingFromSubscription, customerId, invoiceSubscriptionId } from "@/lib/billing/subscription";

export const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

async function findOrg(opts: { orgId?: string | null; customer?: string | null; subscription?: string | null }) {
  if (opts.orgId) {
    const [row] = await db.select().from(orgBilling).where(eq(orgBilling.orgId, opts.orgId));
    if (row) return row;
  }
  if (opts.subscription) {
    const [row] = await db.select().from(orgBilling).where(eq(orgBilling.stripeSubscriptionId, opts.subscription));
    if (row) return row;
  }
  if (opts.customer) {
    const [row] = await db.select().from(orgBilling).where(eq(orgBilling.stripeCustomerId, opts.customer));
    if (row) return row;
  }
  return null;
}

// `eventAt` is the event's creation time. `fresh` marks a subscription just
// retrieved from Stripe (current by definition); one taken from an event
// payload is only applied if no newer event has been.
async function applySubscription(
  sub: Stripe.Subscription,
  eventType: string,
  eventAt: Date,
  opts: { orgIdHint?: string | null; fresh: boolean },
) {
  const cust = customerId(sub.customer);
  const row = await findOrg({ orgId: opts.orgIdHint ?? sub.metadata?.org_id, customer: cust, subscription: sub.id });
  if (!row) {
    console.warn("[stripe] subscription for unknown org", { subscription: sub.id, eventType });
    return;
  }
  // Stripe doesn't deliver in order: an older "updated" arriving after a
  // newer one would roll the org back.
  if (!opts.fresh && row.stripeEventAt && eventAt < row.stripeEventAt) return;
  const patch = billingFromSubscription(sub, row, new Date());
  if (!patch) return;
  // Late events about an old subscription must not downgrade an org that has
  // since started a new one.
  if (row.stripeSubscriptionId && row.stripeSubscriptionId !== sub.id && patch.plan !== "pro") return;
  const newest = row.stripeEventAt && row.stripeEventAt > eventAt ? row.stripeEventAt : eventAt;
  await db
    .update(orgBilling)
    .set({ ...patch, stripeCustomerId: cust ?? row.stripeCustomerId, trialEndsAt: null, stripeEventAt: newest, updatedAt: new Date() })
    .where(eq(orgBilling.orgId, row.orgId));
  if (patch.status === "past_due" && row.status !== "past_due") {
    await emailOrgOwner(
      row.orgId,
      "Your payment didn't go through",
      `We couldn't charge your card for Asincly Pro. Pro keeps working for ${PAST_DUE_GRACE_DAYS} days while Stripe retries; update your card in the billing portal to keep it.`,
    );
  }
  if (row.plan === "pro" && patch.plan === "free") {
    await emailOrgOwner(
      row.orgId,
      "You're on the Free plan now",
      `Your Pro subscription has ended. Your team keeps working on Free. Videos older than the Free plan's history window are kept for ${FREE_PURGE_GRACE_DAYS} more days, then deleted; upgrading again before then keeps them.`,
    );
  }
  if (patch.plan !== row.plan || patch.status !== row.status) {
    await audit({
      orgId: row.orgId,
      actorUserId: null,
      action: "billing.status",
      resourceType: "organization",
      resourceId: row.orgId,
      meta: { from: `${row.plan}/${row.status}`, to: `${patch.plan}/${patch.status}`, event: eventType },
    });
  }
}

// Handles one verified event. Returns false when it was already processed.
export async function handleStripeEvent(event: Stripe.Event): Promise<boolean> {
  if (!HANDLED_EVENTS.has(event.type)) return true;

  const inserted = await db
    .insert(stripeEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });
  if (inserted.length === 0) return false;
  const eventAt = event.created ? new Date(event.created * 1000) : new Date();

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        // Card payments arrive as "paid"; delayed methods finish in the async event.
        if (session.mode !== "subscription" || session.payment_status === "unpaid") break;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (!subId) break;
        const orgId = session.client_reference_id ?? session.metadata?.org_id ?? null;
        const cust = customerId(session.customer);
        if (orgId && cust) {
          await db
            .update(orgBilling)
            .set({ stripeCustomerId: cust, stripeSubscriptionId: subId, updatedAt: new Date() })
            .where(eq(orgBilling.orgId, orgId));
        }
        const sub = await getStripe().subscriptions.retrieve(subId);
        await applySubscription(sub, event.type, eventAt, { orgIdHint: orgId, fresh: true });
        // People may have joined while the customer was on the checkout page.
        if (orgId) await syncSeats(orgId);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object, event.type, eventAt, { fresh: false });
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const subId = invoiceSubscriptionId(event.data.object);
        if (!subId) break;
        const sub = await getStripe().subscriptions.retrieve(subId);
        await applySubscription(sub, event.type, eventAt, { fresh: true });
        break;
      }
    }
  } catch (e) {
    // Let Stripe retry: forget the event so the next delivery reprocesses it.
    await db.delete(stripeEvents).where(eq(stripeEvents.id, event.id));
    throw e;
  }
  return true;
}
