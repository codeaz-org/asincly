import { expect, test } from "@playwright/test";
import {
  addToTeam,
  cleanup,
  seedOrgWithTeam,
  seedSubmittedCheckIn,
  seedUserWithSession,
  signInAs,
} from "./fixtures";

test.afterAll(async () => {
  await cleanup();
});

test("offer help, react, reply, and resolve a blocker", async ({ browser }) => {
  const alice = await seedUserWithSession("s-alice");
  const bob = await seedUserWithSession("s-bob");
  const { org, team } = await seedOrgWithTeam(alice.user.id);
  await addToTeam(team.id, bob.user.id);
  await seedSubmittedCheckIn(team.id, alice.user.id, {
    today: "- [ ] Release notes",
    blockers: "- Waiting on the staging keys",
  });
  const teamUrl = `/${org.slug}/${team.slug}`;

  // Bob: help + react + reply.
  const bobCtx = await browser.newContext();
  await signInAs(bobCtx, bob.sessionToken);
  const bobPage = await bobCtx.newPage();
  await bobPage.goto(teamUrl, { waitUntil: "networkidle" });

  const attention = bobPage.getByRole("region", { name: /needs attention/i });
  await attention.getByRole("button", { name: /i can help/i }).click();
  await expect(attention.getByRole("button", { name: /you're helping/i })).toBeVisible();

  // Slack-style reaction: open the picker, search, pick.
  await bobPage.getByRole("button", { name: "Add reaction" }).first().click();
  await bobPage.getByPlaceholder("Search emoji").fill("party popper");
  await bobPage.getByRole("gridcell", { name: /party popper/i }).first().click();
  const tada = bobPage.getByRole("button", { name: "React with 🎉, 1" }).first();
  await expect(tada).toHaveAttribute("aria-pressed", "true");

  await bobPage.getByRole("link", { name: /reply/i }).first().click();
  const reply = bobPage.getByLabel("Write a reply");
  await reply.fill("I have the keys, sending now ");
  // :shortcode: autocomplete inserts the emoji.
  await reply.pressSequentially(":rocke");
  await bobPage.getByRole("option", { name: /:rocket:/ }).click();
  await expect(reply).toHaveValue("I have the keys, sending now 🚀 ");
  await bobPage.getByRole("button", { name: /^reply$/i }).click();
  await expect(bobPage.getByText("I have the keys, sending now 🚀")).toBeVisible();

  // React to the reply itself.
  await bobPage.getByRole("button", { name: "Add reaction" }).last().click();
  await bobPage.getByRole("button", { name: "React with 👍" }).click();
  await expect(bobPage.getByRole("button", { name: "React with 👍, 1" })).toBeVisible();

  // Alice: sees the reply and resolves her blocker.
  const aliceCtx = await browser.newContext();
  await signInAs(aliceCtx, alice.sessionToken);
  const alicePage = await aliceCtx.newPage();
  await alicePage.goto(teamUrl, { waitUntil: "networkidle" });
  const aliceAttention = alicePage.getByRole("region", { name: /needs attention/i });
  await expect(aliceAttention.getByText(/can help/)).toBeVisible();
  await expect(aliceAttention.getByText(/replied/)).toBeVisible();
  await aliceAttention.getByRole("button", { name: /^resolved$/i }).click();
  await expect(aliceAttention.getByRole("button", { name: /reopen/i })).toBeVisible();

  // Inbox carries the help + reply notifications.
  await alicePage.getByRole("button", { name: /inbox/i }).click();
  await expect(alicePage.getByText(/can help with your blocker/i)).toBeVisible();

  await bobCtx.close();
  await aliceCtx.close();
});
