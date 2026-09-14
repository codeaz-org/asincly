import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { schedules } from "../src/db/schema";
import { cleanup, seedOrgWithTeam, seedUserWithSession, signInAs, testDb } from "./fixtures";

// A team that doesn't stand up every day must not be asked to check in on the
// days it skips. Seeded users are tz UTC, so "today" here is the UTC weekday.
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const todayCode = DAYS[new Date().getUTCDay()];
const everyDayExceptToday = `FREQ=WEEKLY;BYDAY=${DAYS.filter((d) => d !== todayCode).join(",")}`;
const onlyToday = `FREQ=WEEKLY;BYDAY=${todayCode}`;

test.afterAll(async () => {
  await cleanup();
});

async function seedTeamOn(rrule: string, prefix: string) {
  const user = await seedUserWithSession(prefix);
  const { org, team } = await seedOrgWithTeam(user.user.id);
  await testDb
    .update(schedules)
    .set({ rrule, windowOpenLocal: "00:00", windowCloseLocal: "23:59" })
    .where(eq(schedules.teamId, team.id));
  return { user, org, team };
}

test("a schedule that skips today offers no check-in", async ({ browser }) => {
  const { user, org, team } = await seedTeamOn(everyDayExceptToday, "offday");
  const ctx = await browser.newContext();
  await signInAs(ctx, user.sessionToken);
  const page = await ctx.newPage();

  // Today: the card states there's nothing due and offers no way in.
  await page.goto(`/${org.slug}/${team.slug}`, { waitUntil: "networkidle" });
  await expect(page.getByText(/nothing due today/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /^check in$/i })).toHaveCount(0);

  // Straight to the check-in URL: refused, and it says when the next one is.
  await page.goto(`/${org.slug}/${team.slug}/check-in`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /no check-in today/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /back to your team/i })).toBeVisible();
  await page.screenshot({ path: "test-results/off-day-check-in.png", fullPage: true });
});

test("a schedule that includes today still opens the check-in flow", async ({ browser }) => {
  const { user, org, team } = await seedTeamOn(onlyToday, "onday");
  const ctx = await browser.newContext();
  await signInAs(ctx, user.sessionToken);
  const page = await ctx.newPage();

  await page.goto(`/${org.slug}/${team.slug}/check-in`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /talk through your day/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /no check-in today/i })).toHaveCount(0);
});
