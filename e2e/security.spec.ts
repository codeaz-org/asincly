import { expect, test } from "@playwright/test";
import { totp } from "../src/lib/totp";
import { cleanup, newSessionFor, seedOrgWithTeam, seedUserWithSession, setOrgSecurity, signInAs } from "./fixtures";

test.afterAll(async () => {
  await cleanup();
});

test("admin 2FA: required by the org → enrol → new sign-in is challenged → backup code works once", async ({ browser }) => {
  const owner = await seedUserWithSession("mfa-owner");
  const { org, team } = await seedOrgWithTeam(owner.user.id);
  await setOrgSecurity(org.id, { require2faForAdmins: true });
  const teamUrl = `/${org.slug}/${team.slug}`;

  // An owner without 2FA in an org that requires it is sent to enrol.
  const ctx = await browser.newContext();
  await signInAs(ctx, owner.sessionToken);
  const page = await ctx.newPage();
  await page.goto(teamUrl);
  await page.waitForURL(/\/account\/security\?required=1/);

  await page.getByRole("button", { name: /set up two-factor/i }).click();
  const key = (await page.locator("code").innerText()).replace(/\s/g, "");
  await page.getByPlaceholder("123456").fill(totp(key, new Date()));
  await page.getByRole("button", { name: /turn on/i }).click();
  await expect(page.locator("ul li")).toHaveCount(10);
  const codes = await page.locator("ul li").allInnerTexts();
  await page.getByRole("button", { name: /saved them/i }).click();

  // The enrolling browser carries on.
  await page.goto(teamUrl);
  await expect(page).toHaveURL(new RegExp(`${team.slug}$`));

  // A new sign-in is challenged; a backup code gets through, once.
  const second = await newSessionFor(owner.user.id);
  const ctx2 = await browser.newContext();
  await signInAs(ctx2, second);
  const page2 = await ctx2.newPage();
  await page2.goto(teamUrl);
  await page2.waitForURL(/\/account\/2fa/);
  await page2.getByPlaceholder(/backup code/i).fill(codes[0]);
  await page2.getByRole("button", { name: /continue/i }).click();
  await page2.waitForURL((u) => !u.pathname.startsWith("/account/2fa"));
  await page2.goto(teamUrl);
  await expect(page2).toHaveURL(new RegExp(`${team.slug}$`));

  const third = await newSessionFor(owner.user.id);
  const ctx3 = await browser.newContext();
  await signInAs(ctx3, third);
  const page3 = await ctx3.newPage();
  await page3.goto("/account/2fa");
  await page3.getByPlaceholder(/backup code/i).fill(codes[0]);
  await page3.getByRole("button", { name: /continue/i }).click();
  await expect(page3.getByText(/that code didn't work/i)).toBeVisible();

  // Signing the second browser out from the first.
  await page.goto("/account/security");
  await expect(page.getByText(/where you.re signed in/i)).toBeVisible();
  await page.getByRole("button", { name: /sign out everywhere else/i }).click();
  await expect(page.getByRole("button", { name: /sign out everywhere else/i })).toHaveCount(0);
  await page2.goto(teamUrl);
  await page2.waitForURL(/\/sign-in/);

  await Promise.all([ctx.close(), ctx2.close(), ctx3.close()]);
});

test("a magic link is refused for a domain whose org requires SSO", async ({ page }) => {
  const owner = await seedUserWithSession("sso-owner");
  const { org } = await seedOrgWithTeam(owner.user.id);
  const domain = `sso-${Date.now()}.e2e.example`;
  await setOrgSecurity(org.id, { requireSso: true, ssoDomain: domain });

  await page.goto("/sign-in");
  await page.getByPlaceholder("you@company.com").fill(`someone@${domain}`);
  await page.getByRole("button", { name: /email me a link/i }).click();
  await expect(page.getByText(/signs in with Google/i)).toBeVisible();

  await setOrgSecurity(org.id, { requireSso: false, ssoDomain: null });
});

test("a sixth magic link for one inbox within an hour is refused with a clear message", async ({ page, request }) => {
  const email = `ml-limit-${Date.now()}@e2e.local`;
  for (let i = 0; i < 5; i++) {
    const { csrfToken } = await (await request.get("/api/auth/csrf")).json();
    const r = await request.post("/api/auth/signin/resend", { form: { email, csrfToken, callbackUrl: "/" }, maxRedirects: 0 });
    expect(r.headers()["location"]).not.toContain("error");
  }

  await page.goto("/sign-in");
  await page.getByPlaceholder("you@company.com").fill(email);
  await page.getByRole("button", { name: /email me a link/i }).click();
  await expect(page.getByText(/too many sign-in attempts/i)).toBeVisible();
});
