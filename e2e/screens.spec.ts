import { test } from "@playwright/test";
import {
  cleanup,
  seedOrgWithTeam,
  seedUserWithSession,
  signInAs,
} from "./fixtures";

// Visual smoke: screenshots of the authed surfaces into test-results/screens.
// Not assertion-based — the PNGs are read by a human (or a model) after runs.

test.afterAll(async () => {
  await cleanup();
});

test("screenshot check-in editor and team feed", async ({ browser }) => {
  const alice = await seedUserWithSession("shot-alice");
  const { org, team } = await seedOrgWithTeam(alice.user.id);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await signInAs(ctx, alice.sessionToken);
  const page = await ctx.newPage();

  await page.goto(`/${org.slug}/${team.slug}/check-in`);
  await page.waitForSelector("h1");
  await page.screenshot({ path: "test-results/screens/app-check-in.png" });

  await page.goto(`/${org.slug}/${team.slug}`);
  await page.waitForSelector("h1, header");
  await page.screenshot({ path: "test-results/screens/app-feed.png" });

  await ctx.close();
});
