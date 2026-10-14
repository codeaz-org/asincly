import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM for the most sensitive text we hold (transcripts, summaries,
// drafts, Slack tokens, TOTP secrets).
//
// Envelope: "v1.<keyId>.<base64 of [12-byte IV][ciphertext][16-byte tag]>"
// - keyId (first 8 hex of SHA-256 of the key) picks the key, so the key can be
//   rotated: set the new DATA_ENCRYPTION_KEY, move the old one to
//   DATA_ENCRYPTION_KEYS_OLD, run scripts/rotate-encryption-key.ts.
// - `context` (e.g. "recording:<id>:transcript") is bound in as GCM
//   associated data, so a ciphertext copied onto another row won't decrypt.
// Values written before v1 (bare base64, no context) still decrypt.

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

type Key = { id: string; key: Buffer };

function parseKey(raw: string, name: string): Key {
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes base64 (got ${key.length})`);
  return { id: createHash("sha256").update(key).digest("hex").slice(0, 8), key };
}

function currentKey(): Key {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY is not set");
  return parseKey(raw, "DATA_ENCRYPTION_KEY");
}

function allKeys(): Key[] {
  const old = (process.env.DATA_ENCRYPTION_KEYS_OLD ?? "")
    .split(",")
    .filter((s) => s.trim())
    .map((s) => parseKey(s, "DATA_ENCRYPTION_KEYS_OLD"));
  return [currentKey(), ...old];
}

export function encrypt(plaintext: string, context: string): string {
  if (!plaintext) return "";
  const { id, key } = currentKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1.${id}.${Buffer.concat([iv, enc, cipher.getAuthTag()]).toString("base64")}`;
}

export function decrypt(envelope: string, context: string): string {
  if (!envelope) return "";
  const v1 = /^v1\.([0-9a-f]{8})\.(.+)$/.exec(envelope);
  if (v1) {
    const k = allKeys().find((x) => x.id === v1[1]);
    if (!k) throw new Error(`No key with id ${v1[1]} (set DATA_ENCRYPTION_KEYS_OLD?)`);
    return open(k.key, Buffer.from(v1[2], "base64"), Buffer.from(context, "utf8"));
  }
  // Legacy: no key id, no associated data. Try each key.
  let last: unknown;
  for (const k of allKeys()) {
    try {
      return open(k.key, Buffer.from(envelope, "base64"), null);
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("decrypt failed");
}

// True when a value isn't on the current key and format yet.
export function needsRotation(envelope: string): boolean {
  if (!envelope) return false;
  return !envelope.startsWith(`v1.${currentKey().id}.`);
}

function open(key: Buffer, buf: Buffer, aad: Buffer | null): string {
  if (buf.length < IV_LEN + TAG_LEN) throw new Error("ciphertext too short");
  const decipher = createDecipheriv(ALGO, key, buf.subarray(0, IV_LEN));
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(buf.subarray(buf.length - TAG_LEN));
  return Buffer.concat([decipher.update(buf.subarray(IV_LEN, buf.length - TAG_LEN)), decipher.final()]).toString("utf8");
}
