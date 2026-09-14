import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogs, members, orgBilling, organizations, stripeEvents, teams, users } from "@/db/schema";
import { POST } from "@/app/api/stripe/webhook/route";
import { aiSecondsRemaining, countBillableSeats, getEntitlements, recordAiUsage } from "./entitlements";
import { fakeSubscription } from "./test-fixtures";

// Requires local Postgres up (pnpm db:up) with migrations applied.

const WEBHOOK_SECRET = "whsec_test_asincly";
const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const env = { ...process.env };

let orgId: string;
const userIds: string[] = [];
const eventIds: string[] = [];

beforeAll(async () => {
  process.env.BILLING_ENABLED = "true";
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

  const [org] = await db.insert(organizations).values({ name: "Billing", slug: uniq("billing") }).returning();
  orgId = org.id;
  const [t1] = await db.insert(teams).values({ orgId, name: "One", slug: "one" }).returning();
  const [t2] = await db.insert(teams).values({ orgId, name: "Two", slug: "two" }).returning();
  const people = await db
    .insert(users)
    .values(["owner", "member", "guest"].map((n) => ({ email: `${uniq(n)}@t.local`, name: n })))
    .returning();
  userIds.push(...people.map((p) => p.id));
  const [owner, member, guest] = people;
  await db.insert(members).values([
    { teamId: t1.id, userId: owner.id, role: "owner" },
    { teamId: t2.id, userId: owner.id, role: "owner" },
    { teamId: t1.id, userId: member.id, role: "member" },
    { teamId: t1.id, userId: guest.id, role: "guest" },
  ]);
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  for (const id of userIds) await db.delete(users).where(eq(users.id, id));
  for (const id of eventIds) await db.delete(stripeEvents).where(eq(stripeEvents.id, id));
  process.env = env;
});

function signedRequest(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const header = new Stripe("sk_test_dummy").webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body: payload,
  });
}

function subscriptionEvent(type: string, sub: Stripe.Subscription) {
  const id = `evt_${Math.random().toString(36).slice(2, 12)}`;
  eventIds.push(id);
  return { id, object: "event", type, api_version: "2026-08-26.dahlia", data: { object: sub } };
}

describe("entitlements (DB)", () => {
  it("counts distinct billable people and ignores guests", async () => {
    expect(await countBillableSeats(orgId)).toBe(2);
  });

  it("starts a Pro trial the first time an org is seen", async () => {
    const e = await getEntitlements(orgId);
    expect(e).toMatchObject({ plan: "pro", status: "trialing" });
    const [row] = await db.select().from(orgBilling).where(eq(orgBilling.orgId, orgId));
    expect(row.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
  });

  it("accumulates AI seconds per month", async () => {
    await db.update(orgBilling).set({ status: "canceled" }).where(eq(orgBilling.orgId, orgId));
    await recordAiUsage(orgId, 100.2);
    await recordAiUsage(orgId, 50);
    expect(await aiSecondsRemaining(orgId)).toBe(30 * 60 - 151);
  });
});

describe("stripe webhook", () => {
  it("rejects a bad signature", async () => {
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=nope" },
      body: "{}",
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("upgrades the org on an active subscription, once", async () => {
    await db.update(orgBilling).set({ stripeCustomerId: `cus_${orgId}` }).where(eq(orgBilling.orgId, orgId));
    const sub = fakeSubscription({ id: `sub_${orgId}`, customer: `cus_${orgId}`, metadata: { org_id: orgId } });
    const event = subscriptionEvent("customer.subscription.updated", sub);

    const first = await POST(signedRequest(event));
    expect(await first.json()).toEqual({ ok: true, duplicate: false });
    const [row] = await db.select().from(orgBilling).where(eq(orgBilling.orgId, orgId));
    expect(row).toMatchObject({ plan: "pro", status: "active", seats: 4, stripeSubscriptionId: sub.id, trialEndsAt: null });

    const again = await POST(signedRequest(event));
    expect(await again.json()).toEqual({ ok: true, duplicate: true });

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
    expect(logs.filter((l) => l.action === "billing.status")).toHaveLength(1);
  });

  it("ignores a deletion for a subscription the org no longer uses", async () => {
    const old = fakeSubscription({ id: "sub_old", customer: `cus_${orgId}`, status: "canceled", metadata: { org_id: orgId } });
    await POST(signedRequest(subscriptionEvent("customer.subscription.deleted", old)));
    const [row] = await db.select().from(orgBilling).where(eq(orgBilling.orgId, orgId));
    expect(row.plan).toBe("pro");
  });

  it("downgrades to Free when the subscription ends", async () => {
    const ended = fakeSubscription({ id: `sub_${orgId}`, customer: `cus_${orgId}`, status: "canceled" });
    await POST(signedRequest(subscriptionEvent("customer.subscription.deleted", ended)));
    const e = await getEntitlements(orgId);
    expect(e).toMatchObject({ plan: "free", status: "canceled", maxMembers: 3 });
  });
});
