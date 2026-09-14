"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { members, orgBilling, organizations, teams } from "@/db/schema";
import { audit } from "@/lib/audit";
import { countBillableSeats, ensureOrgBilling } from "@/lib/billing/entitlements";
import { isBillingEnabled } from "@/lib/billing/plans";
import { getStripe, integrationIdentifier, priceIdFor, stripeConfigured, stripeTaxEnabled } from "@/lib/billing/stripe";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { BillingTeamSchema, StartCheckoutSchema } from "@/lib/validation/billing";

export type BillingRedirect = { ok: true; url: string } | { ok: false; error: string };

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Only the owner of the team the request comes from can change billing.
async function requireBillingOwner(teamId: string, userId: string) {
  const [row] = await db
    .select({
      role: members.role,
      orgId: teams.orgId,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      teamSlug: teams.slug,
    })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(and(eq(members.teamId, teamId), eq(members.userId, userId)));
  if (!row || row.role !== "owner") return null;
  return row;
}

function unavailable(): BillingRedirect | null {
  if (!isBillingEnabled() || !stripeConfigured()) return { ok: false, error: "Billing isn't available on this server." };
  return null;
}

export async function startCheckout(input: unknown): Promise<BillingRedirect> {
  const off = unavailable();
  if (off) return off;
  const parsed = StartCheckoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const user = await requireUser();
  if (!rateLimit(`checkout:${user.id}`, 10, 60 * 60 * 1000).allowed) {
    return { ok: false, error: "Too many attempts. Try again later." };
  }
  const ctx = await requireBillingOwner(parsed.data.teamId, user.id);
  if (!ctx) return { ok: false, error: "Only the owner can change the plan." };

  try {
    const billing = await ensureOrgBilling(ctx.orgId);
    if (billing?.plan === "pro" && (billing.status === "active" || billing.status === "past_due")) {
      return { ok: false, error: "This organization is already on Pro. Use Manage billing." };
    }
    const stripe = getStripe();
    let customer = billing?.stripeCustomerId ?? null;
    if (!customer) {
      const created = await stripe.customers.create({
        name: ctx.orgName,
        email: user.email,
        metadata: { org_id: ctx.orgId },
      });
      customer = created.id;
      await db
        .update(orgBilling)
        .set({ stripeCustomerId: customer, updatedAt: new Date() })
        .where(eq(orgBilling.orgId, ctx.orgId));
    }

    const seats = Math.max(1, await countBillableSeats(ctx.orgId));
    const base = `${appUrl()}/${ctx.orgSlug}/${ctx.teamSlug}/settings/billing`;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: ctx.orgId,
      line_items: [{ price: await priceIdFor(parsed.data.interval), quantity: seats }],
      subscription_data: { metadata: { org_id: ctx.orgId } },
      metadata: { org_id: ctx.orgId },
      tax_id_collection: { enabled: true },
      customer_update: { name: "auto", address: "auto" },
      billing_address_collection: "required",
      // Off until tax registrations exist: with no registration Stripe
      // calculates nothing while the setting looks "on".
      ...(stripeTaxEnabled() ? { automatic_tax: { enabled: true } } : {}),
      integration_identifier: integrationIdentifier(),
      success_url: `${base}?status=success`,
      cancel_url: `${base}?status=canceled`,
    });
    if (!session.url) return { ok: false, error: "Stripe didn't return a checkout link." };

    await audit({
      orgId: ctx.orgId,
      actorUserId: user.id,
      action: "billing.checkout",
      resourceType: "organization",
      resourceId: ctx.orgId,
      meta: { interval: parsed.data.interval, seats },
    });
    return { ok: true, url: session.url };
  } catch (e) {
    console.error("[billing] checkout failed", { orgId: ctx.orgId, error: (e as Error).message });
    return { ok: false, error: "Couldn't start checkout. Try again in a moment." };
  }
}

export async function openBillingPortal(input: unknown): Promise<BillingRedirect> {
  const off = unavailable();
  if (off) return off;
  const parsed = BillingTeamSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const user = await requireUser();
  if (!rateLimit(`portal:${user.id}`, 20, 60 * 60 * 1000).allowed) {
    return { ok: false, error: "Too many attempts. Try again later." };
  }
  const ctx = await requireBillingOwner(parsed.data.teamId, user.id);
  if (!ctx) return { ok: false, error: "Only the owner can manage billing." };

  const [billing] = await db.select().from(orgBilling).where(eq(orgBilling.orgId, ctx.orgId));
  if (!billing?.stripeCustomerId) return { ok: false, error: "No billing account yet. Upgrade first." };

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      return_url: `${appUrl()}/${ctx.orgSlug}/${ctx.teamSlug}/settings/billing`,
    });
    return { ok: true, url: session.url };
  } catch (e) {
    console.error("[billing] portal failed", { orgId: ctx.orgId, error: (e as Error).message });
    return { ok: false, error: "Couldn't open billing. Try again in a moment." };
  }
}
