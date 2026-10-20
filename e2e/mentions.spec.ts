import { expect, test } from "@playwright/test";

// Linear-style mentions in the check-in editor.
import { and, eq } from "drizzle-orm";
import { notifications } from "../src/db/schema";
import { addToTeam, seedOrgWithTeam, seedSubmittedCheckIn, seedUserWithSession, setUserName, signInAs, testDb } from "./fixtures";
test("@ opens a teammate menu at the caret; a pick shows as a pill and Backspace removes it whole", async ({ browser }) => {
  const a = await seedUserWithSession("ma");
  const { org, team } = await seedOrgWithTeam(a.user.id);
  for (const n of ["Anton Zaharia", "Lena Ruiz", "Sam Miller"]) {
    const u = await seedUserWithSession("mb");
    await addToTeam(team.id, u.user.id);
    await setUserName(u.user.id, n);
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await signInAs(ctx, a.sessionToken);
  const p = await ctx.newPage();
  await p.goto(`/${org.slug}/${team.slug}/check-in`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /write it instead/i }).click();
  const box = p.getByRole("textbox", { name: "Yesterday" });
  await box.click();
  await p.keyboard.type("Paired with ");
  await p.keyboard.type("@");
  await expect(p.getByRole("listbox", { name: "Teammates" })).toBeVisible();
  await p.keyboard.type("le");
  await p.keyboard.press("Enter");
  await p.keyboard.type("on the keys, then asked @an");
  await p.keyboard.press("Enter");
  await p.keyboard.type("for config");
  await expect(box).toHaveValue(/Paired with @Lena Ruiz on the keys, then asked @Anton Zaharia for config/);
  await p.keyboard.press("End");
  for (let i = 0; i < 12; i++) await p.keyboard.press("Backspace");
  await expect(box).toHaveValue(/then asked $/);
});

test("@ lists you too, and says so when nobody matches", async ({ browser }) => {
  const a = await seedUserWithSession("solo");
  await setUserName(a.user.id, "Anton Solo");
  const { org, team } = await seedOrgWithTeam(a.user.id);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await signInAs(ctx, a.sessionToken);
  const p = await ctx.newPage();
  await p.goto(`/${org.slug}/${team.slug}/check-in`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /write it instead/i }).click();
  const box = p.getByRole("textbox", { name: "Yesterday" });
  await box.click();
  await p.keyboard.type("Note to @");
  const menu = p.getByRole("listbox", { name: "Teammates" });
  await expect(menu.getByRole("option", { name: /Anton Solo/ })).toContainText("You");
  await p.keyboard.type("zz");
  await expect(p.getByRole("status").filter({ hasText: "No teammates on this team yet" })).toBeVisible();
  for (let i = 0; i < 2; i++) await p.keyboard.press("Backspace");
  await p.keyboard.type("an");
  await p.keyboard.press("Enter");
  await expect(box).toHaveValue(/Note to @Anton Solo $/);
  await ctx.close();
});

test("@ in a reply: the menu opens above a box at the bottom, and the person named is notified", async ({ browser }) => {
  const author = await seedUserWithSession("ra");
  const me = await seedUserWithSession("rb");
  const carol = await seedUserWithSession("rc");
  await setUserName(author.user.id, "Alice Author");
  await setUserName(me.user.id, "Rita Replier");
  await setUserName(carol.user.id, "Carol Keys");
  const { org, team } = await seedOrgWithTeam(author.user.id);
  await addToTeam(team.id, me.user.id);
  await addToTeam(team.id, carol.user.id);
  const { id: checkInId } = await seedSubmittedCheckIn(team.id, author.user.id, { today: "- [ ] Ship it" }, 0);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 700 } });
  await signInAs(ctx, me.sessionToken);
  const p = await ctx.newPage();
  await p.goto(`/${org.slug}/${team.slug}/c/${checkInId}`, { waitUntil: "networkidle" });
  const box = p.getByRole("textbox", { name: "Write a reply" });
  await box.scrollIntoViewIfNeeded();
  await box.click();
  await p.keyboard.type("Thanks! @ca");
  const menu = p.getByRole("listbox", { name: "Teammates" });
  await expect(menu.getByRole("option", { name: /Carol Keys/ })).toBeVisible();
  // Not on top of what's being typed.
  const [m, t] = [await menu.boundingBox(), await box.boundingBox()];
  expect(m!.y + m!.height <= t!.y + 14 || m!.y >= t!.y + 30).toBe(true);
  await p.keyboard.press("Enter");
  await p.keyboard.type("can you share the keys?");
  await p.getByRole("button", { name: "Reply", exact: true }).click();
  const reply = p.getByRole("listitem").filter({ hasText: "can you share the keys?" });
  await expect(reply.getByText("@Carol Keys")).toBeVisible();
  await expect(reply.getByText(/mention:/)).toHaveCount(0);
  await expect
    .poll(async () =>
      (await testDb.select().from(notifications).where(and(eq(notifications.userId, carol.user.id), eq(notifications.type, "mentioned")))).length,
    )
    .toBe(1);
  await ctx.close();
});
