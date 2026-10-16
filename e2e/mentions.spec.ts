import { expect, test } from "@playwright/test";

// Linear-style mentions in the check-in editor.
import { addToTeam, seedOrgWithTeam, seedUserWithSession, setUserName, signInAs } from "./fixtures";
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
