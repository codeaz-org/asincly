import { expect, test } from "@playwright/test";
import { addToTeam, cleanup, seedOrgWithTeam, seedSubmittedCheckIn, seedUserWithSession, setUserName, signInAs } from "./fixtures";

test.afterAll(async () => {
  await cleanup();
});

test("reactions and replies reach the author live; reactions group into one notification; opening it reads it", async ({ browser }) => {
  test.setTimeout(90_000);
  const alice = await seedUserWithSession("live-a");
  const bob = await seedUserWithSession("live-b");
  const carol = await seedUserWithSession("live-c");
  await setUserName(alice.user.id, "Alice Author");
  await setUserName(bob.user.id, "Bob Builder");
  await setUserName(carol.user.id, "Carol Keys");
  const { org, team } = await seedOrgWithTeam(alice.user.id);
  await addToTeam(team.id, bob.user.id);
  await addToTeam(team.id, carol.user.id);
  const { id: checkInId } = await seedSubmittedCheckIn(team.id, alice.user.id, { today: "- [ ] Ship the live feed" }, 0);
  const detail = `/${org.slug}/${team.slug}/c/${checkInId}`;

  // Alice sits on her feed; nobody reloads it.
  const aCtx = await browser.newContext();
  await signInAs(aCtx, alice.sessionToken);
  const a = await aCtx.newPage();
  await a.goto(`/${org.slug}/${team.slug}`, { waitUntil: "networkidle" });
  await expect(a.getByRole("button", { name: "Inbox", exact: true })).toBeVisible();

  for (const [who, emoji, name] of [
    [bob, "party popper", "🎉"],
    [carol, "quick", "👍"],
  ] as const) {
    const ctx = await browser.newContext();
    await signInAs(ctx, who.sessionToken);
    const p = await ctx.newPage();
    await p.goto(detail, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Add reaction" }).first().click();
    if (emoji === "quick") {
      await p.getByRole("button", { name: `React with ${name}` }).click();
    } else {
      await p.getByPlaceholder("Search emoji").fill(emoji);
      await p.getByRole("gridcell", { name: new RegExp(emoji, "i") }).first().click();
    }
    await expect(p.getByRole("button", { name: new RegExp(`React with ${name}, 1`) }).first()).toBeVisible();
    // The count updates before the server answers; let the request finish.
    await p.waitForLoadState("networkidle");
    if (who === bob) {
      await p.getByRole("textbox", { name: "Write a reply" }).fill("Nice work");
      await p.getByRole("button", { name: "Reply", exact: true }).click();
      await expect(p.getByRole("listitem").filter({ hasText: "Nice work" })).toBeVisible();
    }
    await ctx.close();
  }

  // Arrives without a reload: one reply notification, one for both reactions.
  await expect(a.getByRole("button", { name: "Inbox, 2 unread" })).toBeVisible({ timeout: 20_000 });
  await expect(a.getByText("Nice work").first()).toBeVisible();
  await a.getByRole("button", { name: "Inbox, 2 unread" }).click();
  const grouped = a.getByRole("link", { name: /Carol Keys and Bob Builder reacted to your check-in/ });
  // Carol's reaction rewrites Bob's notification rather than adding one, and
  // lands live in the open inbox.
  await expect(grouped).toBeVisible({ timeout: 20_000 });
  await expect(grouped).toContainText("👍 🎉");
  await expect(a.getByRole("link", { name: /Bob Builder replied to your check-in/ })).toBeVisible();

  // Opening a notification reads it.
  await grouped.click();
  await a.waitForURL(new RegExp(`/c/${checkInId}`));
  await expect(a.getByRole("button", { name: "Inbox, 1 unread" })).toBeVisible({ timeout: 10_000 });
  await aCtx.close();
});
