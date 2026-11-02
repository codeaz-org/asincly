import { expect, test } from "@playwright/test";
import { cleanup, seedOrgWithTeam, seedSuperAdmin, seedUserWithSession, signInAs } from "./fixtures";

// SUPER_ADMIN_EMAILS must list both addresses (set in CI).
const ADMIN = "superadmin@e2e.local";
const ADMIN_NO_2FA = "superadmin-no2fa@e2e.local";

test.afterAll(async () => {
  await cleanup();
});

test("/admin is a plain 404 for anyone not listed", async ({ browser }) => {
  const someone = await seedUserWithSession("not-admin");
  const ctx = await browser.newContext();
  await signInAs(ctx, someone.sessionToken);
  const page = await ctx.newPage();
  await page.goto("/admin");
  await expect(page.getByText("Nobody’s awake here.")).toBeVisible();
  await expect(page.getByText("Everything, at a glance")).toHaveCount(0);
  await ctx.close();
});

test("a listed admin must have 2FA first", async ({ browser }) => {
  const admin = await seedSuperAdmin(ADMIN_NO_2FA, false);
  const ctx = await browser.newContext();
  await signInAs(ctx, admin.sessionToken);
  const page = await ctx.newPage();
  await page.goto("/admin");
  await page.waitForURL(/\/account\/security\?required=admin$/);
  await expect(page.getByText("The admin area needs two-factor.")).toBeVisible();
  await ctx.close();
});

test("the admin sees every organization and, with plans on, grants Pro", async ({ browser }) => {
  const owner = await seedUserWithSession("admin-view-owner");
  const { org } = await seedOrgWithTeam(owner.user.id);
  const admin = await seedSuperAdmin(ADMIN, true);
  const ctx = await browser.newContext();
  await signInAs(ctx, admin.sessionToken);
  const page = await ctx.newPage();
  await page.goto("/admin", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Everything, at a glance" })).toBeVisible();
  const row = page.getByRole("region", { name: /^Organizations/ }).getByRole("row").filter({ hasText: org.slug });
  await expect(row).toContainText(owner.user.email);

  if (process.env.BILLING_ENABLED !== "true") return;
  await row.getByRole("button", { name: `Grant Pro to ${org.name}` }).click();
  await expect(row.getByText("Pro · granted")).toBeVisible();
  await row.getByRole("button", { name: `Move ${org.name} to Free` }).click();
  await expect(row.getByText("Free", { exact: true })).toBeVisible();
  await ctx.close();
});
