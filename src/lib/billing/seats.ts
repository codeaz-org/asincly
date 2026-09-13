import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgBilling } from "@/db/schema";
import { countBillableSeats } from "@/lib/billing/entitlements";
import { isBillingEnabled } from "@/lib/billing/plans";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";

// Keeps the Stripe subscription quantity equal to the org's billable members.
// Call after any change to membership or roles. Never throws: a Stripe outage
// must not undo an invite; the next change (or webhook) re-syncs.
export async function syncSeats(orgId: string): Promise<void> {
  if (!isBillingEnabled()) return;
  try {
    const seats = Math.max(1, await countBillableSeats(orgId));
    const [row] = await db.select().from(orgBilling).where(eq(orgBilling.orgId, orgId));
    if (!row || row.seats === seats) return;
    await db.update(orgBilling).set({ seats, updatedAt: new Date() }).where(eq(orgBilling.orgId, orgId));

    const subscribed = row.stripeSubscriptionId && (row.status === "active" || row.status === "past_due");
    if (!subscribed || !stripeConfigured()) return;
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(row.stripeSubscriptionId!);
    const item = sub.items.data[0];
    if (!item || item.quantity === seats) return;
    await stripe.subscriptionItems.update(item.id, { quantity: seats, proration_behavior: "create_prorations" });
  } catch (e) {
    console.error("[billing] seat sync failed", { orgId, error: (e as Error).message });
  }
}

// Deleting an organization ends its subscription right away, so nobody keeps
// paying for a workspace that no longer exists. Throws on Stripe errors so the
// delete doesn't go ahead while billing is still running.
export async function cancelSubscriptionForDeletedOrg(orgId: string): Promise<void> {
  if (!isBillingEnabled()) return;
  const [row] = await db.select().from(orgBilling).where(eq(orgBilling.orgId, orgId));
  if (!row?.stripeSubscriptionId || row.status === "canceled" || !stripeConfigured()) return;
  await getStripe().subscriptions.cancel(row.stripeSubscriptionId, { prorate: true });
}
