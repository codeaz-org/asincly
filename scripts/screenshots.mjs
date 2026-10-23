#!/usr/bin/env node
// Regenerates docs/screenshots (and the README's demo GIF) from the demo workspace.
//   pnpm db:seed --session          → prints session=<token>
//   AI_FAKE=1 pnpm dev              → in another terminal
//   node scripts/screenshots.mjs <token>          (BASE_URL=http://localhost:3001 for another port)
//   node scripts/screenshots.mjs <token> --gif-only   (docs/screenshots/demo.gif; needs ffmpeg)
// Uses the installed Chrome (fake camera/mic flags) and the fake AI drafter.
// Both runs change the demo data (drafts, a sent check-in): `pnpm db:seed`
// before each.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, devices } from "@playwright/test";
const token = process.argv[2];
if (!token) throw new Error("usage: node scripts/screenshots.mjs <session-token>");
// Written outside the project and copied in at the end: a file appearing in
// the tree while the dev server watches it reloads the page mid-shot.
const dest = "docs/screenshots";
const out = mkdtempSync(join(tmpdir(), "asincly-shots-"));
const gifOnly = process.argv.includes("--gif-only");
const base = process.env.BASE_URL ?? "http://localhost:3000";
// For the GIF, the fake camera plays a slow warm gradient instead of
// Chrome's green test pattern.
const camArgs = [];
if (gifOnly) {
  const cam = join(mkdtempSync(join(tmpdir(), "asincly-cam-")), "cam.y4m");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i",
    "gradients=s=640x360:c0=0x5a3418:c1=0x1c130d:c2=0x8a5226:n=3:speed=0.015:duration=6:rate=24",
    "-vf", "vignette=PI/4", "-pix_fmt", "yuv420p", cam]);
  camArgs.push(`--use-file-for-fake-video-capture=${cam}`);
}
const b = await chromium.launch({
  channel: "chrome",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", ...camArgs],
});
const hideDev = "nextjs-portal{display:none!important}";

async function ctxFor(device, auth = true) {
  const ctx = await b.newContext({
    ...(device === "mobile" ? devices["Pixel 7"] : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }),
    permissions: ["camera", "microphone"],
    colorScheme: "dark",
    // The demo viewer's zone: the app adopts the browser's, so pin it.
    timezoneId: "Europe/Lisbon",
  });
  if (auth) await ctx.addCookies([{ name: "authjs.session-token", value: token, domain: "localhost", path: "/" }]);
  return ctx;
}
async function shot(name, { device = "desktop", path, auth = true, act, full = false, height }) {
  if (gifOnly) return;
  const ctx = await ctxFor(device, auth);
  const p = await ctx.newPage();
  if (height) await p.setViewportSize({ width: 1440, height });
  await p.goto(base + path, { waitUntil: "load", timeout: 90_000 });
  // The landing page keeps fetching (scroll scenes); don't wait forever.
  await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
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
// Read-only screens first; the check-in screens below leave a draft behind.
await shot("inbox", {
  path: "/northwind/product",
  act: async (p) => {
    await p.getByRole("button", { name: /^Inbox/ }).click();
    await p.getByRole("link", { name: /reacted to your check-in/ }).waitFor();
  },
});
await shot("people", { path: "/northwind/product/people", height: 1300 });
await shot("settings", { path: "/northwind/product/settings", height: 1200 });
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

await shot("mentions", {
  path: "/northwind/product/check-in?step=today",
  act: async (p) => {
    const box = p.getByRole("textbox", { name: "Today" });

// Full video flow with the fake camera → AI-drafted review.
if (!gifOnly) {
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


    await box.click();
    await p.keyboard.press("End");
    await p.keyboard.type("\nPair with @");
    await p.keyboard.type("k");
    await p.getByRole("listbox", { name: "Teammates" }).waitFor();
  },
});


// The core loop as a GIF for the top of the README: record → AI draft → send.
if (gifOnly) {
  const dir = mkdtempSync(join(tmpdir(), "asincly-gif-"));
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir, size: { width: 1280, height: 800 } },
    permissions: ["camera", "microphone"],
    colorScheme: "dark",
    timezoneId: "Europe/Lisbon",
  });
  await ctx.addCookies([{ name: "authjs.session-token", value: token, domain: new URL(base).hostname, path: "/" }]);
  const p = await ctx.newPage();
  const pause = (ms) => p.waitForTimeout(ms);
  await p.goto(base + "/northwind/product/check-in?step=video", { waitUntil: "networkidle" });
  await p.addStyleTag({ content: hideDev });
  await pause(1200);
  const panel = p.getByRole("complementary", { name: /while you talk/i });
  await panel.getByLabel("Your notes").pressSequentially("- pricing page is live\n- ask Kenji about billing", { delay: 35 });
  await p.getByRole("button", { name: /turn on camera/i }).click();
  await pause(900);
  await p.getByRole("button", { name: /start recording/i }).click();
  await pause(3200);
  await p.getByRole("button", { name: /stop recording/i }).click();
  await pause(700);
  await p.getByRole("button", { name: /use this video/i }).click();
  await p.getByRole("button", { name: /send check-in/i }).waitFor({ timeout: 40000 });
  await p.addStyleTag({ content: hideDev });
  await pause(2600);
  await p.getByRole("button", { name: /send check-in/i }).click();
  await p.waitForURL(/focus=/, { timeout: 20000 });
  await p.addStyleTag({ content: hideDev });
  await pause(2800);
  await ctx.close();
  const video = join(dir, readdirSync(dir).find((f) => f.endsWith(".webm")));
  // Two-pass palette keeps the dark UI's gradients clean at a small size.
  const scale = "fps=12,scale=960:-1:flags=lanczos";
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-vf", `${scale},palettegen=stats_mode=diff`, join(dir, "palette.png")]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-i", join(dir, "palette.png"),
    "-lavfi", `${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, `${out}/demo.gif`]);
  rmSync(dir, { recursive: true, force: true });
  console.log("✓ demo.gif");
}
await b.close();
cpSync(out, dest, { recursive: true });
rmSync(out, { recursive: true, force: true });
