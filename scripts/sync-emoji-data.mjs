#!/usr/bin/env node
// Self-hosts the emoji dataset the picker and :shortcode: autocomplete use.
// The CSP only allows 'self', so nothing is fetched from a CDN at runtime.
// Run after bumping EMOJIBASE_VERSION:  node scripts/sync-emoji-data.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, copyFileSync, rmSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EMOJIBASE_VERSION = "17.0.0";
const FILES = ["LICENSE", "en/data.json", "en/messages.json", "en/shortcodes/iamcal.json"];

const work = mkdtempSync(join(tmpdir(), "emojibase-"));
try {
  execFileSync("npm", ["pack", `emojibase-data@${EMOJIBASE_VERSION}`, "--pack-destination", work, "--silent"], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const tarball = readdirSync(work).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error("npm pack produced no tarball");
  execFileSync("tar", ["-xzf", join(work, tarball), "-C", work, ...FILES.map((f) => `package/${f}`)]);

  const out = join(process.cwd(), "public", "emoji", EMOJIBASE_VERSION);
  for (const file of FILES) {
    const dest = join(out, file);
    mkdirSync(join(dest, ".."), { recursive: true });
    copyFileSync(join(work, "package", file), dest);
    console.log(`${dest}  ${(statSync(dest).size / 1024).toFixed(0)} KB`);
  }

  // Compact [shortcode, emoji] index for :shortcode: autocomplete, so the
  // editor never has to load the full dataset.
  const data = JSON.parse(readFileSync(join(out, "en/data.json"), "utf8"));
  const codes = JSON.parse(readFileSync(join(out, "en/shortcodes/iamcal.json"), "utf8"));
  const index = [];
  for (const e of data) {
    const names = codes[e.hexcode];
    if (!names || !e.emoji) continue;
    for (const name of Array.isArray(names) ? names : [names]) index.push([name, e.emoji]);
  }
  index.sort((a, b) => a[0].localeCompare(b[0]));
  const indexPath = join(out, "en/shortcode-index.json");
  writeFileSync(indexPath, JSON.stringify(index));
  console.log(`${indexPath}  ${(statSync(indexPath).size / 1024).toFixed(0)} KB, ${index.length} shortcodes`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
