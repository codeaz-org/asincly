import { expect, test, type Page } from "@playwright/test";

// The split landing is scroll-driven: one playhead (--p on .stage) eases toward
// the scroll position and everything on screen follows it.

// Wait for hydration: the loop's first frame writes --p. Scrolling before that
// is undone by the router's scroll reset.
async function ready(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => document.querySelector<HTMLElement>(".stage")?.style.getPropertyValue("--p") !== "");
}

async function progress(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".split")!;
    const total = el.offsetHeight - innerHeight;
    const target = Math.min(1, Math.max(0, (scrollY - (el.getBoundingClientRect().top + scrollY)) / total));
    const shown = +getComputedStyle(document.querySelector(".stage")!).getPropertyValue("--p");
    return { target, shown, total };
  });
}

test("the scene settles exactly where you scrolled", async ({ page }) => {
  await ready(page);
  await page.mouse.move(800, 400);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 100);
    // Used to stop up to ~17px of scroll short, so each new scroll began with
    // a catch-up jump.
    await expect
      .poll(async () => {
        const { target, shown, total } = await progress(page);
        return Math.abs(target - shown) * total;
      })
      .toBeLessThan(1);
  }
});

test("scrolling to the end makes the close actionable", async ({ page }) => {
  await ready(page);
  const cta = page.getByRole("link", { name: /Start your team.s morning/ });
  await expect(cta).toBeHidden();
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(cta).toBeVisible();
  await expect.poll(() => cta.evaluate((el) => +getComputedStyle(el.closest(".panel")!).opacity)).toBe(1);
  await cta.click();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("reduced motion jumps straight to the scroll position", async ({ browser }) => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  await ready(page);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByRole("link", { name: /Start your team.s morning/ })).toBeVisible();
  await expect.poll(async () => (await progress(page)).shown).toBe(1);
  await page.close();
});
