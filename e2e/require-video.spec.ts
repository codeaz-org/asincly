import { expect, test } from "@playwright/test";
import { addToTeam, cleanup, seedOrgWithTeam, seedUserWithSession, setUserName, signInAs } from "./fixtures";

test.afterAll(async () => {
  await cleanup();
});

test("owner requires video; a member skips with a reason the owner can see", async ({ browser }) => {
  const owner = await seedUserWithSession("rv-owner");
  const member = await seedUserWithSession("rv-member");
  await setUserName(member.user.id, "Mona Member");
  const { org, team } = await seedOrgWithTeam(owner.user.id);
  await addToTeam(team.id, member.user.id);
  const teamUrl = `/${org.slug}/${team.slug}`;

  // Owner turns the rule on.
  const ownerCtx = await browser.newContext();
  await signInAs(ownerCtx, owner.sessionToken);
  const ownerPage = await ownerCtx.newPage();
  await ownerPage.goto(`${teamUrl}/settings`, { waitUntil: "networkidle" });
  const toggle = ownerPage.getByRole("switch", { name: /require a video/i });
  await toggle.click();
  await ownerPage.waitForLoadState("networkidle");
  await ownerPage.reload({ waitUntil: "networkidle" });
  await expect(ownerPage.getByRole("switch", { name: /require a video/i })).toHaveAttribute("aria-checked", "true");

  // Member: no "write it instead" shortcut, sending is blocked without a video.
  const memberCtx = await browser.newContext();
  await signInAs(memberCtx, member.sessionToken);
  const page = await memberCtx.newPage();
  await page.goto(`${teamUrl}/check-in`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /can.t record today/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /write it instead/i })).toHaveCount(0);

  await page.goto(`${teamUrl}/check-in?step=today`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Today" }).fill("- [ ] Fix the flaky test");
  await page.getByRole("button", { name: /next: blockers/i }).click();
  await page.getByRole("button", { name: /nothing blocking me/i }).click();
  await expect(page.getByText(/your team asks for a video with every check-in/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /send check-in/i })).toBeDisabled();

  // Skip with a reason, then send.
  await page.getByRole("button", { name: /can.t today/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /noisy place/i }).click();
  await dialog.getByRole("button", { name: /write it instead/i }).click();
  await expect(page.getByText(/no video today: noisy place/i)).toBeVisible();
  await Promise.all([
    page.waitForURL(new RegExp(`${team.slug}\\?focus=`), { timeout: 15000 }),
    page.getByRole("button", { name: /send check-in/i }).click(),
  ]);

  // Owner sees the reason on the card.
  await ownerPage.goto(teamUrl);
  await expect(ownerPage.getByText(/no video · noisy place/i)).toBeVisible();

  await ownerCtx.close();
  await memberCtx.close();
});
