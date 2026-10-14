import { expect, test } from "@playwright/test";
import { addToTeam, cleanup, seedOrgWithTeam, seedUserWithSession, setUserName, signInAs } from "./fixtures";

test.afterAll(async () => {
  await cleanup();
});

test("the team owner promotes a member to admin, then hands over the team", async ({ browser }) => {
  const owner = await seedUserWithSession("roles-owner");
  const member = await seedUserWithSession("roles-member");
  await setUserName(owner.user.id, "Olive Owner");
  await setUserName(member.user.id, "Mia Member");
  const { org, team } = await seedOrgWithTeam(owner.user.id);
  await addToTeam(team.id, member.user.id);

  const ctx = await browser.newContext();
  await signInAs(ctx, owner.sessionToken);
  const page = await ctx.newPage();
  await page.goto(`/${org.slug}/${team.slug}/people`, { waitUntil: "networkidle" });

  const mia = page.getByRole("listitem").filter({ hasText: "Mia Member" });
  await mia.getByRole("button", { name: /change mia member's role/i }).click();
  await page.getByRole("menuitem", { name: /make admin/i }).click();
  await expect(mia.getByText("admin", { exact: true })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await mia.getByRole("button", { name: /change mia member's role/i }).click();
  await page.getByRole("menuitem", { name: /make team owner/i }).click();
  await expect(mia.getByText("owner", { exact: true })).toBeVisible();
  // The old owner is an admin now and no longer gets the role menu.
  await expect(page.getByRole("button", { name: /change .*'s role/i })).toHaveCount(0);

  await ctx.close();
});
