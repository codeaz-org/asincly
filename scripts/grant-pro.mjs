#!/usr/bin/env node
// Switches an organization to Pro by hand, with no Stripe subscription: for
// early teams while card payments aren't set up, or a comped account.
//
//   DATABASE_URL=... node scripts/grant-pro.mjs <org-slug>
//   DATABASE_URL=... node scripts/grant-pro.mjs <org-slug> --revoke
//
// Revoking moves it back to Free and starts the usual video grace period then.
// An org that pays through Stripe is left alone: manage it in Stripe.
import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const slug = process.argv[2];
const revoke = process.argv.includes("--revoke");
if (!url || !slug || slug.startsWith("--")) {
  console.error("Usage: DATABASE_URL=... node scripts/grant-pro.mjs <org-slug> [--revoke]");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const [org] = await sql`select id, name from organization where slug = ${slug}`;
  if (!org) throw new Error(`No organization with slug "${slug}"`);
  const [paying] = await sql`select 1 from org_billing where org_id = ${org.id} and stripe_subscription_id is not null`;
  if (paying) throw new Error(`"${org.name}" has a Stripe subscription; change it in Stripe instead`);

  const plan = revoke ? "free" : "pro";
  // Free gets trial_ends_at = now: freeSince() starts the video grace period from here.
  const trialEndsAt = revoke ? new Date() : null;
  await sql.begin(async (tx) => {
    await tx`
      insert into org_billing (org_id, plan, status, trial_ends_at)
      values (${org.id}, ${plan}, 'active', ${trialEndsAt})
      on conflict (org_id) do update
        set plan = excluded.plan, status = 'active', trial_ends_at = excluded.trial_ends_at,
            past_due_since = null, updated_at = now()`;
    await tx`
      insert into audit_log (org_id, action, resource_type, resource_id, meta)
      values (${org.id}, ${revoke ? "billing.pro_revoked" : "billing.pro_granted"}, 'organization', ${org.id},
              ${sql.json({ by: "scripts/grant-pro.mjs" })})`;
  });
  console.log(`${org.name} (${slug}) is now on ${revoke ? "Free" : "Pro"}.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
