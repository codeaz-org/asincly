import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateBackupCodes,
  generateSecret,
  hashBackupCode,
  hotp,
  totp,
  verifyTotp,
} from "./totp";

// RFC 6238 appendix B, SHA-1 rows (8 digits), secret "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const VECTORS: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("totp", () => {
  it("matches the RFC 6238 test vectors", () => {
    for (const [seconds, code] of VECTORS) {
      expect(totp(RFC_SECRET, new Date(seconds * 1000), 8)).toBe(code);
    }
  });

  it("matches the RFC 4226 HOTP vectors", () => {
    const key = Buffer.from("12345678901234567890");
    expect([0, 1, 2, 9].map((c) => hotp(key, c))).toEqual(["755224", "287082", "359152", "520489"]);
  });

  it("round-trips base32", () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it("accepts the adjacent step for drift, nothing further", () => {
    const secret = generateSecret();
    const now = new Date("2026-10-14T12:00:15Z");
    const code = totp(secret, now);
    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, code, new Date(now.getTime() + 30_000))).toBe(true);
    expect(verifyTotp(secret, code, new Date(now.getTime() + 90_000))).toBe(false);
    expect(verifyTotp(secret, "12345", now)).toBe(false);
  });

  it("makes ten distinct backup codes and hashes them forgivingly", () => {
    const codes = generateBackupCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    expect(hashBackupCode(codes[0].toUpperCase().replace("-", " "))).toBe(hashBackupCode(codes[0]));
  });
});
