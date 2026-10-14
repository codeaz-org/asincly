import { expect, test } from "@playwright/test";
import { cleanup, seedUserWithSession, signInAs } from "./fixtures";

test.afterAll(async () => {
  await cleanup();
});

test("a new user sets up an organization, accepting the terms, and lands on their team", async ({ browser }) => {
  const me = await seedUserWithSession("onboard");
  const ctx = await browser.newContext();
  await signInAs(ctx, me.sessionToken);
  const page = await ctx.newPage();
  await page.goto("/");
  await page.waitForURL(/\/onboarding/);

  await page.getByLabel("Your name").fill("Nia New");
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByLabel("Organization").fill(`Onboard Co ${Date.now()}`);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByLabel("Team").fill("Core");
  await page.getByRole("button", { name: /continue/i }).click();

  // The last step can't be sent without accepting the terms.
  const accept = page.getByRole("checkbox", { name: /accept the terms/i });
  await expect(accept).toBeVisible();
  await accept.check();
  await page.getByRole("button", { name: /create team/i }).click();
  await page.waitForURL(/\/core$/);
  await expect(page.getByRole("heading").first()).toBeVisible();
  await ctx.close();
});
