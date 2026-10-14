import { createCipheriv, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, needsRotation } from "./crypto";

const key = () => randomBytes(32).toString("base64");

beforeEach(() => {
  // Give the tests a real 32-byte key regardless of local .env state.
  process.env.DATA_ENCRYPTION_KEY = key();
  delete process.env.DATA_ENCRYPTION_KEYS_OLD;
});

// The pre-v1 envelope: bare base64 of [iv][ct][tag], no associated data.
function legacyEncrypt(plaintext: string, b64key: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(b64key, "base64"), iv);
  const enc = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return Buffer.concat([iv, enc, c.getAuthTag()]).toString("base64");
}

describe("crypto", () => {
  it("round-trips utf8", () => {
    const s = "hello — this is a transcript with unicode ✓ and 中文";
    expect(decrypt(encrypt(s, "ctx"), "ctx")).toBe(s);
  });

  it("returns empty string for empty input on both sides", () => {
    expect(encrypt("", "ctx")).toBe("");
    expect(decrypt("", "ctx")).toBe("");
  });

  it("produces different ciphertext for the same plaintext (fresh IV)", () => {
    const a = encrypt("same text", "ctx");
    const b = encrypt("same text", "ctx");
    expect(a).not.toBe(b);
    expect(decrypt(a, "ctx")).toBe(decrypt(b, "ctx"));
  });

  it("rejects tampered ciphertext", () => {
    const c = encrypt("secret", "ctx");
    const [v, id, body] = c.split(".");
    const buf = Buffer.from(body, "base64");
    buf[14] ^= 0xff;
    expect(() => decrypt(`${v}.${id}.${buf.toString("base64")}`, "ctx")).toThrow();
  });

  it("won't decrypt a value copied onto another row", () => {
    const c = encrypt("team A's transcript", "recording:a:transcript");
    expect(() => decrypt(c, "recording:b:transcript")).toThrow();
  });

  it("still reads values written before the versioned envelope", () => {
    const legacy = legacyEncrypt("old transcript", process.env.DATA_ENCRYPTION_KEY!);
    expect(decrypt(legacy, "anything")).toBe("old transcript");
    expect(needsRotation(legacy)).toBe(true);
  });

  it("reads values under a retired key once it's listed as old, and flags them for rotation", () => {
    const old = process.env.DATA_ENCRYPTION_KEY!;
    const c = encrypt("written before rotation", "ctx");
    process.env.DATA_ENCRYPTION_KEY = key();
    expect(() => decrypt(c, "ctx")).toThrow(/No key with id/);
    process.env.DATA_ENCRYPTION_KEYS_OLD = old;
    expect(decrypt(c, "ctx")).toBe("written before rotation");
    expect(needsRotation(c)).toBe(true);
    expect(needsRotation(encrypt("new", "ctx"))).toBe(false);
  });

  it("rejects a key that isn't 32 bytes", () => {
    process.env.DATA_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encrypt("x", "ctx")).toThrow(/32 bytes/);
  });
});
