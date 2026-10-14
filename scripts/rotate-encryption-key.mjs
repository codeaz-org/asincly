#!/usr/bin/env node
// Re-encrypts every encrypted column with the current DATA_ENCRYPTION_KEY and
// the v1 envelope (key id + row-bound context). Run after a key change:
//
//   1. Generate a key:          openssl rand -base64 32
//   2. Set DATA_ENCRYPTION_KEY to it and move the old value into
//      DATA_ENCRYPTION_KEYS_OLD (comma-separated); deploy.
//   3. pnpm db:rotate-key       (idempotent; safe to re-run)
//   4. When it reports 0 left, drop the old key from DATA_ENCRYPTION_KEYS_OLD.
//
// Also upgrades values written before the v1 envelope; run it once after
// updating even without a new key.
import "dotenv/config";
import postgres from "postgres";
import { decrypt, encrypt, needsRotation } from "../src/lib/crypto.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });

const COLUMNS = [
  { table: "recording", id: "id", column: "transcript_cipher", context: (r) => `recording:${r.id}:transcript` },
  { table: "recording", id: "id", column: "summary_cipher", context: (r) => `recording:${r.id}:summary` },
  { table: "recording", id: "id", column: "draft_cipher", context: (r) => `recording:${r.id}:draft` },
  { table: "slack_install", id: "team_id", column: "bot_token_cipher", context: (r) => `slack:${r.id}` },
  { table: "user_totp", id: "user_id", column: "secret_cipher", context: (r) => `totp:${r.id}` },
];

let rotated = 0;
let failed = 0;
try {
  for (const c of COLUMNS) {
    const rows = await sql`select ${sql(c.id)} as id, ${sql(c.column)} as v from ${sql(c.table)} where ${sql(c.column)} <> ''`;
    for (const r of rows) {
      if (!needsRotation(r.v)) continue;
      try {
        const next = encrypt(decrypt(r.v, c.context(r)), c.context(r));
        await sql`update ${sql(c.table)} set ${sql(c.column)} = ${next} where ${sql(c.id)} = ${r.id} and ${sql(c.column)} = ${r.v}`;
        rotated++;
      } catch (e) {
        failed++;
        console.error(`${c.table}.${c.column} ${r.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  console.log(`rotated ${rotated}, failed ${failed}`);
  if (failed) process.exitCode = 1;
} finally {
  await sql.end();
}
