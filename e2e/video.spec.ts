import { chromium, expect, test } from "@playwright/test";
import {
  addToTeam,
  cleanup,
  seedOrgWithTeam,
  seedSubmittedCheckIn,
  seedUserWithSession,
  setUserName,
  signInAs,
} from "./fixtures";

// Real end-to-end video: fake camera → record → upload to MinIO → pipeline
// drafts the check-in. Run the dev server with AI_FAKE=1 so drafting is
// deterministic (see src/lib/ai/fake.ts).

test.afterAll(async () => {
  await cleanup();
});

test("record a video → AI drafts the check-in from the previous plan → send", async () => {
  test.skip(process.env.AI_FAKE !== "1", "needs the dev server started with AI_FAKE=1");
  test.setTimeout(120_000);
  const user = await seedUserWithSession("vid");
  const mate = await seedUserWithSession("mate");
  await setUserName(user.user.id, "Vera Video");
  await setUserName(mate.user.id, "Bobby Tables");
  const { org, team } = await seedOrgWithTeam(user.user.id);
  await addToTeam(team.id, mate.user.id);
  // Last time's plan: the fake drafter marks the first item done and carries the rest.
  await seedSubmittedCheckIn(team.id, user.user.id, { today: "- [ ] Ship the old plan\n- [ ] Finish the migration" }, 1);

  const browser = await chromium.launch({
    channel: process.env.PW_CHANNEL,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["camera", "microphone"] });
  await signInAs(ctx, user.sessionToken);
  const page = await ctx.newPage();

  await page.goto(`http://localhost:3000/${org.slug}/${team.slug}/check-in`, { waitUntil: "networkidle" });

  // While you talk: the previous plan is on screen.
  const panel = page.getByRole("complementary", { name: /while you talk/i });
  await expect(panel.getByText("Ship the old plan")).toBeVisible();
  await expect(panel.getByText("Finish the migration")).toBeVisible();

  await page.getByRole("button", { name: /turn on camera/i }).click();
  await page.getByRole("button", { name: /start recording/i }).click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /stop recording/i }).click();
  await page.getByRole("button", { name: /use this video/i }).click({ timeout: 10000 });

  // Processing → review with the draft.
  await expect(page.getByRole("heading", { name: /this is what your team sees/i })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/drafted from your video/i)).toBeVisible();
  const card = page.locator("article");
  await expect(card.getByText("Ship the old plan")).toBeVisible();
  await expect(card.getByText("Write the release notes")).toBeVisible();
  // Carried forward into Today (and still listed under Yesterday as not done).
  await expect(card.getByText("Finish the migration")).toHaveCount(2);

  // Auto-tagged teammate, removable before sending.
  const tag = page.getByRole("button", { name: /remove tag for bobby tables/i });
  await expect(tag).toBeVisible();
  await tag.click();
  await expect(tag).toHaveCount(0);

  await page.screenshot({ path: "scrollcraft/lab/asincly/app-video-draft.png" });

  await page.getByRole("button", { name: /send check-in/i }).click();
  await page.waitForURL(new RegExp(`${team.slug}\\?focus=`), { timeout: 15000 });
  await expect(page.getByRole("button", { name: /play video note/i })).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: "scrollcraft/lab/asincly/app-feed-video.png" });

  await ctx.close();
  await browser.close();
});
