import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { sendEmail } from "@/lib/email";

// Billing emails go to the org owner (the one person who can act on them)
// and can't be unsubscribed from. Failures are logged, never thrown: a
// webhook or cron must not fail because an email didn't go out.
export async function emailOrgOwner(orgId: string, subject: string, text: string): Promise<void> {
  try {
    const [row] = await db
      .select({ email: users.email, org: organizations.name })
      .from(organizations)
      .innerJoin(users, eq(users.id, organizations.ownerUserId))
      .where(eq(organizations.id, orgId));
    if (!row) return;
    const app = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    await sendEmail({
      to: row.email,
      subject: `${subject} · ${row.org}`,
      text: `${text}\n\nPlan & billing: open ${app} → Settings → Plan & billing.`,
    });
  } catch (e) {
    console.error("[billing] owner email failed", { orgId, error: e instanceof Error ? e.message : "unknown error" });
  }
}
