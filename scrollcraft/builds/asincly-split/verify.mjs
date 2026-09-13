// Purpose-built verifier for the living-ribbon grammar.
// Walks scroll from 0 → 1 in 11 samples, shoots each, plus a full-page
// contact sheet, at desktop / mobile / reduced-motion. Prints dead-scroll
// warnings: if two adjacent samples produce byte-identical PNGs the page
// isn't advancing.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../lab/asincly-split");
const URL_ = process.env.URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

fs.mkdirSync(OUT, { recursive: true });

const shots = [0.00, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00];

async function shootProfile(label, opts) {
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext(opts.context ?? {});
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);

  const hashes = [];
  for (const p of shots) {
    await page.evaluate((frac) => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, total * frac);
    }, p);
    await page.waitForTimeout(240);
    const file = path.join(dir, `p-${String(Math.round(p * 100)).padStart(3, "0")}.png`);
    const buf = await page.screenshot({ fullPage: false });
    fs.writeFileSync(file, buf);
    hashes.push({ p, file, hash: createHash("sha256").update(buf).digest("hex").slice(0, 12) });
  }

  await browser.close();

  const dead = [];
  for (let i = 1; i < hashes.length; i++) {
    if (hashes[i].hash === hashes[i - 1].hash) {
      dead.push(`  dead scroll ${hashes[i - 1].p.toFixed(2)} → ${hashes[i].p.toFixed(2)}`);
    }
  }
  console.log(`\n[${label}] shot ${shots.length} samples → ${dir}`);
  for (const h of hashes) console.log(`  p=${h.p.toFixed(2)}  ${h.hash}`);
  if (dead.length) {
    console.log(`\n  ⚠ ${dead.length} dead-scroll gap(s):`);
    for (const d of dead) console.log(d);
  } else {
    console.log(`  ✓ page advances at every sample`);
  }
}

await shootProfile("desktop", {
  context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
});
await shootProfile("mobile", {
  context: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
});
await shootProfile("reduced", {
  context: {
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  },
});

console.log(`\nWrote everything to ${OUT}`);
