import { expect, test } from "@playwright/test";
import { addToTeam, cleanup, seedOrgWithTeam, seedUserWithSession, signInAs } from "./fixtures";

test.afterAll(async () => {
  await cleanup();
});

test("an invite waits until the invitee accepts it", async ({ browser }) => {
  const owner = await seedUserWithSession("inv-owner");
  const { org, team } = await seedOrgWithTeam(owner.user.id);
  const invitee = await seedUserWithSession("inv-guest");
  const teamUrl = `/${org.slug}/${team.slug}`;

  const ownerCtx = await browser.newContext();
  await signInAs(ownerCtx, owner.sessionToken);
  const page = await ownerCtx.newPage();
  await page.goto(`${teamUrl}/people`, { waitUntil: "networkidle" });
  await page.getByLabel("Email addresses").fill(invitee.user.email);
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByText("Invited 1")).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Waiting to accept · 1")).toBeVisible();

  // A second invite, taken back before it's used.
  const stray = `stray-${Date.now()}@e2e.local`;
  await page.getByLabel("Email addresses").fill(stray);
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByText("Invited 1")).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: `Revoke invite for ${stray}` }).click();
  await expect(page.getByText(stray)).toHaveCount(0);
  await expect(page.getByText("Waiting to accept · 1")).toBeVisible();

  // Not on the team yet: signing in lands them on their invites to accept.
  const ctx = await browser.newContext();
  await signInAs(ctx, invitee.sessionToken);
  const p = await ctx.newPage();
  await p.goto("/");
  await p.waitForURL(/\/invites$/);
  await expect(p.getByText(team.name, { exact: true })).toBeVisible();
  await p.getByRole("button", { name: `Join ${team.name}` }).click();
  await p.waitForURL(new RegExp(`${teamUrl}$`));

  // Accepted: off the waiting list.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText(/waiting to accept/i)).toHaveCount(0);

  await Promise.all([ownerCtx.close(), ctx.close()]);
});

test("an org owner can't reset 2FA for someone who is in another org too", async ({ browser }) => {
  const owner = await seedUserWithSession("reset-owner");
  const { org, team } = await seedOrgWithTeam(owner.user.id);
  const other = await seedUserWithSession("reset-other");
  const { team: otherTeam } = await seedOrgWithTeam(other.user.id);
  const victim = await seedUserWithSession("reset-victim");
  await addToTeam(team.id, victim.user.id);
  await addToTeam(otherTeam.id, victim.user.id);

  const ctx = await browser.newContext();
  await signInAs(ctx, owner.sessionToken);
  const page = await ctx.newPage();
  await page.goto(`/${org.slug}/${team.slug}/settings`, { waitUntil: "networkidle" });
  await page.getByLabel("Their email").fill(victim.user.email);
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText(/in another organization too/i)).toBeVisible();
  await ctx.close();
});
