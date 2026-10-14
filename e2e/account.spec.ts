import { expect, test } from "@playwright/test";
import { addToTeam, cleanup, seedOrgWithTeam, seedSubmittedCheckIn, seedUserWithSession, signInAs } from "./fixtures";

test.afterAll(async () => {
  await cleanup();
});

test("a member downloads their own data, and only theirs", async ({ browser }) => {
  const me = await seedUserWithSession("export-me");
  const other = await seedUserWithSession("export-other");
  const { team } = await seedOrgWithTeam(me.user.id);
  await seedSubmittedCheckIn(team.id, me.user.id, { today: "- [ ] Mine to export" });
  await addToTeam(team.id, other.user.id);
  await seedSubmittedCheckIn(team.id, other.user.id, { today: "- [ ] Not mine" });

  const ctx = await browser.newContext();
  await signInAs(ctx, me.sessionToken);
  const res = await ctx.request.get("/api/account/export");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("asincly-my-data");
  const data = await res.json();
  expect(data.profile.email).toBe(me.user.email);
  expect(JSON.stringify(data.checkIns)).toContain("Mine to export");
  expect(JSON.stringify(data)).not.toContain("Not mine");
  await ctx.close();
});
