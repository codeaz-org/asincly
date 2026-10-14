import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30 s steps): what every authenticator
// app speaks. Secrets are RFC 4648 base32, as otpauth:// URIs carry them.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

// HOTP (RFC 4226) for one counter value.
export function hotp(key: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, "0");
}

export function totp(secret: string, at: Date, digits = 6): string {
  return hotp(base32Decode(secret), Math.floor(at.getTime() / 1000 / STEP), digits);
}

// Accepts the current step and one on either side (clock drift, a code
// typed as it rolls over).
export function verifyTotp(secret: string, code: string, at: Date): boolean {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const key = base32Decode(secret);
  const step = Math.floor(at.getTime() / 1000 / STEP);
  return [-1, 0, 1].some((d) => timingSafeEqual(Buffer.from(hotp(key, step + d)), Buffer.from(clean)));
}

export function otpauthUri(secret: string, account: string, issuer = "Asincly"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;
}

// Ten single-use recovery codes, shown once; only their hashes are stored.
export function generateBackupCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const raw = base32Encode(randomBytes(5)).slice(0, 8).toLowerCase();
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.toLowerCase().replace(/[\s-]/g, "")).digest("hex");
}
