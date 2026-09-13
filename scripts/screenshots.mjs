#!/usr/bin/env node
// Regenerates docs/screenshots from the demo workspace.
//   pnpm db:seed --session          → prints session=<token>
//   AI_FAKE=1 pnpm dev              → in another terminal
//   node scripts/screenshots.mjs <token>
// Uses the installed Chrome (fake camera/mic flags) and the fake AI drafter.
import { chromium, devices } from "@playwright/test";
const token = process.argv[2];
if (!token) throw new Error("usage: node scripts/screenshots.mjs <session-token>");
const out = "docs/screenshots";
const base = "http://localhost:3000";
const b = await chromium.launch({ channel: "chrome", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const hideDev = "nextjs-portal{display:none!important}";

async function ctxFor(device, auth = true) {
  const ctx = await b.newContext({
    ...(device === "mobile" ? devices["Pixel 7"] : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }),
    permissions: ["camera", "microphone"],
    colorScheme: "dark",
  });
  if (auth) await ctx.addCookies([{ name: "authjs.session-token", value: token, domain: "localhost", path: "/" }]);
  return ctx;
}
async function shot(name, { device = "desktop", path, auth = true, act, full = false, height }) {
  const ctx = await ctxFor(device, auth);
  const p = await ctx.newPage();
  if (height) await p.setViewportSize({ width: 1440, height });
  await p.goto(base + path, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: hideDev });
  if (act) await act(p);
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  await ctx.close();
  console.log("✓", name);
}

await shot("landing", { path: "/", auth: false });
await shot("sign-in", { path: "/sign-in", auth: false });
await shot("today", { path: "/northwind/product", height: 1500 });
await shot("today-mobile", { device: "mobile", path: "/northwind/product" });
await shot("emoji-reactions", {
  path: "/northwind/product",
  height: 1100,
  act: async (p) => {
    await p.getByRole("heading", { name: /check-ins/i }).scrollIntoViewIfNeeded().catch(() => {});
    await p.evaluate(() => window.scrollBy(0, 520));
    await p.getByRole("button", { name: "Add reaction" }).nth(1).click();
    await p.waitForTimeout(1200);
  },
});
await shot("record", {
  path: "/northwind/product/check-in?step=video",
  act: async (p) => {
    const panel = p.getByRole("complementary", { name: /while you talk/i });
    await panel.getByRole("button", { name: /ship the pricing page/i }).click();
    await panel.getByLabel("Your notes").fill("- pricing page is live 🎉\n- ask Kenji to split the billing PR\n- beta email needs copy review");
  },
});
await shot("record-mobile", {
  device: "mobile",
  path: "/northwind/product/check-in?step=video",
  act: async (p) => {
    await p.getByLabel("Your notes").filter({ visible: true }).fill("- pricing page is live 🎉\n- ask Kenji to split the billing PR");
    await p.evaluate(() => window.scrollTo(0, 380));
  },
});

// Full video flow with the fake camera → AI-drafted review.
{
  const ctx = await ctxFor("desktop");
  const p = await ctx.newPage();
  await p.goto(base + "/northwind/product/check-in?step=video", { waitUntil: "networkidle" });
  await p.addStyleTag({ content: hideDev });
  await p.getByRole("button", { name: /turn on camera/i }).click();
  await p.getByRole("button", { name: /start recording/i }).click();
  await p.waitForTimeout(2000);
  await p.getByRole("button", { name: /stop recording/i }).click();
  await p.getByRole("button", { name: /use this video/i }).click();
  await p.getByRole("button", { name: /send check-in/i }).waitFor({ timeout: 40000 });
  await p.addStyleTag({ content: hideDev });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/ai-review.png` });
  console.log("✓ ai-review");
  await ctx.close();
}

await shot("people", { path: "/northwind/product/people", height: 1300 });
await shot("settings", { path: "/northwind/product/settings", height: 1200 });
await b.close();
