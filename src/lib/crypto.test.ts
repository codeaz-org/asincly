import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";

beforeAll(() => {
  // Give the tests a real 32-byte key regardless of local .env state.
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("crypto", () => {
  it("round-trips utf8", () => {
    const s = "hello — this is a transcript with unicode ✓ and 中文";
    expect(decrypt(encrypt(s))).toBe(s);
  });

  it("returns empty string for empty input on both sides", () => {
    expect(encrypt("")).toBe("");
    expect(decrypt("")).toBe("");
  });

  it("produces different ciphertext for the same plaintext (fresh IV)", () => {
    const a = encrypt("same text");
    const b = encrypt("same text");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it("rejects tampered ciphertext", () => {
    const c = encrypt("secret");
    const buf = Buffer.from(c, "base64");
    buf[buf.length - 1] ^= 0x01; // flip a tag byte
    expect(() => decrypt(buf.toString("base64"))).toThrow();
  });
});
