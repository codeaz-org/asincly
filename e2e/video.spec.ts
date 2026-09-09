import { chromium, expect, test } from "@playwright/test";
import {
  cleanup,
  seedOrgWithTeam,
  seedUserWithSession,
  signInAs,
} from "./fixtures";

// Real end-to-end video: record (fake camera + auto-granted screen) → stop →
// attach → presigned PUT to MinIO → recording row registered. If this passes,
// "videos work" is a fact, not a hope.

test.afterAll(async () => {
  await cleanup();
});

test("record, attach, and upload a video note", async () => {
  test.setTimeout(120_000);
  const user = await seedUserWithSession("vid");
  const { org, team } = await seedOrgWithTeam(user.user.id);

  const browser = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--auto-select-desktop-capture-source=Entire screen",
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["camera", "microphone"],
  });
  await signInAs(ctx, user.sessionToken);
  const page = await ctx.newPage();

  await page.goto(`http://localhost:3000/${org.slug}/${team.slug}/check-in`);
  await page.getByRole("button", { name: /record a video note/i }).click();

  // Live stage appears with the round record button.
  await page.getByRole("button", { name: /start recording/i }).click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /stop recording/i }).click();

  // Preview → attach → uploaded confirmation.
  await page.getByRole("button", { name: /attach to check-in/i }).click({ timeout: 10000 });
  await expect(page.getByText(/video attached/i)).toBeVisible({ timeout: 30000 });

  await page.screenshot({ path: "scrollcraft/lab/asincly/app-video-uploaded.png" });

  // Submit the check-in, then the feed shows the poster card for the video.
  await page.getByRole("button", { name: /submit check-in/i }).click();
  await page.waitForURL(new RegExp(`${team.slug}$`));
  await expect(
    page.getByRole("button", { name: /play video note/i }),
  ).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: "scrollcraft/lab/asincly/app-feed-video.png" });

  await ctx.close();
  await browser.close();
});
