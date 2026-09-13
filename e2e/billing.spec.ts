import { expect, test } from "@playwright/test";
import {
  addToTeamAs,
  cleanup,
  seedOrgWithTeam,
  seedSubmittedCheckIn,
  seedUserWithSession,
  setOrgBilling,
  signInAs,
} from "./fixtures";

// Hosted-cloud behaviour. Run the dev server with BILLING_ENABLED=true.
test.skip(process.env.BILLING_ENABLED !== "true", "billing is disabled");

test.afterAll(async () => {
  await cleanup();
});

const day = 86_400_000;

test("a new organization is on a 14-day Pro trial", async ({ browser }) => {
  const owner = await seedUserWithSession("bill-trial");
  const { org, team } = await seedOrgWithTeam(owner.user.id);
  const ctx = await browser.newContext();
  await signInAs(ctx, owner.sessionToken);
  const page = await ctx.newPage();
  await page.goto(`/${org.slug}/${team.slug}/settings/billing`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Pro trial" })).toBeVisible();
  await expect(page.getByText(/14 days left/)).toBeVisible();
  await ctx.close();
});

test("Free: the 4th member, older history and Pro settings ask for an upgrade", async ({ browser }) => {
  const owner = await seedUserWithSession("bill-free");
  const { org, team } = await seedOrgWithTeam(owner.user.id);
  await setOrgBilling(org.id, { plan: "free", status: "canceled", trialEndsAt: new Date(Date.now() - 2 * day) });
  for (const p of ["m1", "m2"]) {
    const u = await seedUserWithSession(`bill-${p}`);
    await addToTeamAs(team.id, u.user.id, "member");
  }
  await seedSubmittedCheckIn(team.id, owner.user.id, { today: "- [ ] Old news" }, 20);
  const teamUrl = `/${org.slug}/${team.slug}`;

  const ctx = await browser.newContext();
  await signInAs(ctx, owner.sessionToken);
  const page = await ctx.newPage();

  await page.goto(`${teamUrl}/people`, { waitUntil: "networkidle" });
  await expect(page.getByText("3 of 3 members on the Free plan")).toBeVisible();
  await page.getByLabel("Email addresses").fill(`fourth-${Date.now()}@e2e.local`);
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText(/free plan includes up to 3 members/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /see pro →/i })).toBeVisible();
  await expect(page.getByTestId("plan-gate")).toContainText(/includes 1 team/i);

  const old = new Date(Date.now() - 20 * day).toISOString().slice(0, 10);
  await page.goto(`${teamUrl}?day=${old}`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("plan-gate")).toContainText(/last 14 days/i);
  await expect(page.getByText("Old news")).toHaveCount(0);

  await page.goto(`${teamUrl}/settings`, { waitUntil: "networkidle" });
  await expect(page.getByRole("switch", { name: /require a video/i })).toHaveAttribute("data-disabled", "");

  await ctx.close();
});

test("Upgrade opens Stripe Checkout", async ({ browser }) => {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  test.skip(!/^(sk|rk)_test_/.test(key), "needs a Stripe test-mode key and prices");
  const owner = await seedUserWithSession("bill-checkout");
  const { org, team } = await seedOrgWithTeam(owner.user.id);
  const ctx = await browser.newContext();
  await signInAs(ctx, owner.sessionToken);
  const page = await ctx.newPage();
  await page.goto(`/${org.slug}/${team.slug}/settings/billing`, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /monthly/i }).click();
  await Promise.all([
    page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 }),
    page.getByRole("button", { name: /upgrade to pro/i }).click(),
  ]);
  await ctx.close();
});
