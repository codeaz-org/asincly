import { expect, test } from "@playwright/test";
import {
  addToTeamAs,
  cleanup,
  seedOrgWithTeam,
  seedSubmittedCheckIn,
  seedUserWithSession,
  setUserName,
  signInAs,
} from "./fixtures";

test.afterAll(async () => {
  await cleanup();
});

test("a guest reads and replies but doesn't check in or count on the rail", async ({ browser }) => {
  const owner = await seedUserWithSession("guest-owner");
  const guest = await seedUserWithSession("guest-reader");
  await setUserName(owner.user.id, "Olive Owner");
  await setUserName(guest.user.id, "Gus Guest");
  const { org, team } = await seedOrgWithTeam(owner.user.id);
  await addToTeamAs(team.id, guest.user.id, "guest");
  await seedSubmittedCheckIn(team.id, owner.user.id, { today: "- [ ] Ship the pricing page" });
  const teamUrl = `/${org.slug}/${team.slug}`;

  const ctx = await browser.newContext();
  await signInAs(ctx, guest.sessionToken);
  const page = await ctx.newPage();
  await page.goto(teamUrl, { waitUntil: "networkidle" });

  // Only the owner is waited on; the guest has no "your card".
  await expect(page.getByRole("heading", { name: "1 of 1 checked in" })).toBeVisible();
  await expect(page.getByText("Ship the pricing page").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^check in$/i })).toHaveCount(0);

  // The check-in flow sends guests back to the team.
  await page.goto(`${teamUrl}/check-in`);
  await page.waitForURL(new RegExp(`${team.slug}$`));

  // Replying is fine.
  await page.getByRole("link", { name: /reply/i }).first().click();
  await page.getByLabel("Write a reply").fill("Looks great");
  await page.getByRole("button", { name: /^reply$/i }).click();
  await expect(page.getByText("Looks great")).toBeVisible();

  // People shows the guest as a guest, reading along.
  await page.goto(`${teamUrl}/people`, { waitUntil: "networkidle" });
  const card = page.getByRole("listitem").filter({ hasText: "Gus Guest" });
  await expect(card.getByText("guest", { exact: true })).toBeVisible();
  await expect(card.getByText("reads along")).toBeVisible();

  await ctx.close();
});
