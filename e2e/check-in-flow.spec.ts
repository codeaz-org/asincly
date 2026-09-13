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

test("write a check-in instead of recording → appears in teammate's feed", async ({ browser }) => {
  const alice = await seedUserWithSession("alice");
  const bob = await seedUserWithSession("bob");
  const { org, team } = await seedOrgWithTeam(alice.user.id);
  await addToTeam(team.id, bob.user.id);

  const teamUrl = `/${org.slug}/${team.slug}`;

  const aliceCtx = await browser.newContext();
  await signInAs(aliceCtx, alice.sessionToken);
  const alicePage = await aliceCtx.newPage();
  await alicePage.goto(`${teamUrl}/check-in`, { waitUntil: "networkidle" });

  // Video first, with an easy way out.
  await expect(alicePage.getByRole("heading", { name: /talk through your day/i })).toBeVisible();
  await alicePage.getByRole("button", { name: /write it instead/i }).click();

  await expect(alicePage.getByRole("heading", { name: /what moved forward/i })).toBeVisible();
  await alicePage.getByRole("textbox", { name: "Yesterday" }).fill("- Wrote the e2e plan");
  await alicePage.getByRole("button", { name: /next: today/i }).click();

  await expect(alicePage.getByRole("heading", { name: /what's on today/i })).toBeVisible();
  await alicePage.getByRole("textbox", { name: "Today" }).fill("- [ ] Shipped the e2e harness");
  await alicePage.getByRole("button", { name: /next: blockers/i }).click();

  await alicePage.getByRole("button", { name: /nothing blocking me/i }).click();

  await expect(alicePage.getByRole("heading", { name: /this is what your team sees/i })).toBeVisible();
  await expect(alicePage.getByText("Wrote the e2e plan")).toBeVisible();
  await Promise.all([
    alicePage.waitForURL(new RegExp(`${team.slug}\\?focus=`), { timeout: 15000 }),
    alicePage.getByRole("button", { name: /send check-in/i }).click(),
  ]);

  await expect(alicePage.getByText("Shipped the e2e harness").first()).toBeVisible();

  const bobCtx = await browser.newContext();
  await signInAs(bobCtx, bob.sessionToken);
  const bobPage = await bobCtx.newPage();
  await bobPage.goto(teamUrl);
  await expect(bobPage.getByText("Shipped the e2e harness").first()).toBeVisible();
  await expect(bobPage.getByRole("heading", { name: /1 of 2 checked in/i })).toBeVisible();

  await aliceCtx.close();
  await bobCtx.close();
});
