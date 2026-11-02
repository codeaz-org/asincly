"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { orgBilling } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isBillingEnabled } from "@/lib/billing/plans";
import { requireSuperAdmin } from "@/lib/session";

const SetPlanSchema = z.object({ orgId: z.string().uuid(), plan: z.enum(["pro", "free"]) });

// Switch an organization to Pro by hand (no Stripe subscription), or back to
// Free. Same effect as scripts/grant-pro.mjs. Orgs that pay through Stripe
// are left alone: their plan follows the subscription.
export async function setOrgPlan(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();
  if (!isBillingEnabled()) return;
  const parsed = SetPlanSchema.safeParse({ orgId: formData.get("orgId"), plan: formData.get("plan") });
  if (!parsed.success) return;
  const { orgId, plan } = parsed.data;

  const [row] = await db.select({ sub: orgBilling.stripeSubscriptionId }).from(orgBilling).where(eq(orgBilling.orgId, orgId));
  if (row?.sub) return;

  // Back to Free stamps the trial date "now": freeSince() then gives the usual
  // video grace period before the retention job trims old videos.
  const values = { plan, status: "active" as const, trialEndsAt: plan === "pro" ? null : new Date(), pastDueSince: null };
  await db
    .insert(orgBilling)
    .values({ orgId, ...values })
    .onConflictDoUpdate({ target: orgBilling.orgId, set: { ...values, updatedAt: new Date() } });
  await audit({
    orgId,
    actorUserId: admin.id,
    action: plan === "pro" ? "billing.pro_granted" : "billing.pro_revoked",
    resourceType: "organization",
    resourceId: orgId,
    meta: { by: "admin" },
  });
  revalidatePath("/admin");
}
