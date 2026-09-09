import { expect, test } from "@playwright/test";
import {
  addToTeam,
  cleanup,
  seedOrgWithTeam,
  seedUserWithSession,
  signInAs,
} from "./fixtures";

test.afterAll(async () => {
  await cleanup();
});

test("invite → check in → appears in teammate's feed", async ({ browser }) => {
  const alice = await seedUserWithSession("alice");
  const bob = await seedUserWithSession("bob");
  const { org, team } = await seedOrgWithTeam(alice.user.id);
  await addToTeam(team.id, bob.user.id);

  const teamUrl = `/${org.slug}/${team.slug}`;

  // Alice signs in, opens check-in page, writes something, submits.
  const aliceCtx = await browser.newContext();
  await signInAs(aliceCtx, alice.sessionToken);
  const alicePage = await aliceCtx.newPage();
  await alicePage.goto(`${teamUrl}/check-in`);

  await expect(alicePage.getByRole("heading", { name: /check in\./i })).toBeVisible();
  await alicePage.getByRole("textbox").nth(1).fill("Shipped the e2e harness");

  await Promise.all([
    alicePage.waitForURL(new RegExp(`${team.slug}$`)),
    alicePage.getByRole("button", { name: /submit check-in/i }).click(),
  ]);

  // She sees her own card on the feed.
  await expect(alicePage.getByText("Shipped the e2e harness")).toBeVisible();

  // Bob signs in and lands on the team feed. Alice's card is there.
  const bobCtx = await browser.newContext();
  await signInAs(bobCtx, bob.sessionToken);
  const bobPage = await bobCtx.newPage();
  await bobPage.goto(teamUrl);
  await expect(bobPage.getByText("Shipped the e2e harness")).toBeVisible();

  await aliceCtx.close();
  await bobCtx.close();
});
