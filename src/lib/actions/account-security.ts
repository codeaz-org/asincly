"use server";

import { createHash } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { renderSVG } from "uqr";
import { z } from "zod";
import { db } from "@/db";
import { accounts, members, organizations, sessions, teams, users, userTotp } from "@/db/schema";
import { audit } from "@/lib/audit";
import { decrypt, encrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser, requireUserBeforeMfa } from "@/lib/session";
import { generateBackupCodes, generateSecret, hashBackupCode, otpauthUri, verifyTotp } from "@/lib/totp";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const Code = z.string().trim().min(6).max(12);

// Sessions are listed and revoked by a hash of their token: the token itself
// is a bearer credential and never goes to the browser.
const sessionId = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 24);

async function confirmedTotp(userId: string) {
  const [row] = await db.select().from(userTotp).where(eq(userTotp.userId, userId));
  return row?.confirmedAt ? row : null;
}

// ────────── Enrolment ──────────

export async function startTotpEnrolment(): Promise<Result<{ secret: string; svg: string }>> {
  const user = await requireUserBeforeMfa();
  if (await confirmedTotp(user.id)) return { ok: false, error: "Two-factor is already on" };
  const secret = generateSecret();
  await db
    .insert(userTotp)
    .values({ userId: user.id, secretCipher: encrypt(secret, `totp:${user.id}`) })
    .onConflictDoUpdate({ target: userTotp.userId, set: { secretCipher: encrypt(secret, `totp:${user.id}`), confirmedAt: null, backupCodeHashes: [] } });
  return { ok: true, secret, svg: renderSVG(otpauthUri(secret, user.email), { border: 1 }) };
}

// The first valid code turns it on. Returns the backup codes, shown once.
// Every other session is signed out: whoever else held one hasn't passed 2FA.
export async function confirmTotpEnrolment(code: unknown): Promise<Result<{ backupCodes: string[] }>> {
  const user = await requireUserBeforeMfa();
  const parsed = Code.safeParse(code);
  if (!parsed.success) return { ok: false, error: "Enter the 6-digit code" };
  if (!(await rateLimit(`totp-confirm:${user.id}`, 10, 15 * 60_000)).allowed) return { ok: false, error: "Too many tries — wait a few minutes" };
  const [row] = await db.select().from(userTotp).where(eq(userTotp.userId, user.id));
  if (!row || row.confirmedAt) return { ok: false, error: "Start again" };
  if (!verifyTotp(decrypt(row.secretCipher, `totp:${user.id}`), parsed.data, new Date())) return { ok: false, error: "That code didn't match — check the time on your phone" };

  const backupCodes = generateBackupCodes();
  const now = new Date();
  await db
    .update(userTotp)
    .set({ confirmedAt: now, backupCodeHashes: backupCodes.map(hashBackupCode) })
    .where(eq(userTotp.userId, user.id));
  await db.update(sessions).set({ mfaAt: now }).where(eq(sessions.sessionToken, user.sessionToken));
  await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.sessionToken, user.sessionToken)));
  revalidatePath("/account");
  return { ok: true, backupCodes };
}

// ────────── Sign-in challenge ──────────

export async function verifySecondFactor(_prev: unknown, formData: FormData): Promise<Result> {
  const user = await requireUserBeforeMfa();
  const parsed = Code.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, error: "Enter a 6-digit code or a backup code" };
  if (!(await rateLimit(`totp-verify:${user.id}`, 10, 15 * 60_000)).allowed) return { ok: false, error: "Too many tries — wait a few minutes" };
  const row = await confirmedTotp(user.id);
  if (!row) redirect("/");

  let passed = verifyTotp(decrypt(row.secretCipher, `totp:${user.id}`), parsed.data, new Date());
  if (!passed) {
    // A backup code works once.
    const h = hashBackupCode(parsed.data);
    if (row.backupCodeHashes.includes(h)) {
      await db
        .update(userTotp)
        .set({ backupCodeHashes: row.backupCodeHashes.filter((x) => x !== h) })
        .where(eq(userTotp.userId, user.id));
      passed = true;
    }
  }
  if (!passed) return { ok: false, error: "That code didn't work" };
  await db.update(sessions).set({ mfaAt: new Date() }).where(eq(sessions.sessionToken, user.sessionToken));
  redirect("/");
}

// ────────── Turning it off ──────────

export async function disableTotp(code: unknown): Promise<Result> {
  const user = await requireUser();
  const parsed = Code.safeParse(code);
  if (!parsed.success) return { ok: false, error: "Enter a current code to turn it off" };
  if (!(await rateLimit(`totp-disable:${user.id}`, 10, 15 * 60_000)).allowed) return { ok: false, error: "Too many tries — wait a few minutes" };
  const row = await confirmedTotp(user.id);
  if (!row) return { ok: true };
  if (!verifyTotp(decrypt(row.secretCipher, `totp:${user.id}`), parsed.data, new Date())) return { ok: false, error: "That code didn't match" };
  const [required] = await db
    .select({ name: organizations.name })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(and(eq(members.userId, user.id), inArray(members.role, ["owner", "admin"]), eq(organizations.require2faForAdmins, true)))
    .limit(1);
  if (required) return { ok: false, error: `${required.name} requires two-factor for owners and admins` };

  await db.delete(userTotp).where(eq(userTotp.userId, user.id));
  const token = (await requireUserBeforeMfa()).sessionToken;
  await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.sessionToken, token)));
  revalidatePath("/account");
  return { ok: true };
}

// ────────── Sessions ──────────

export type SessionView = {
  id: string;
  current: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
  userAgent: string | null;
  ipPrefix: string | null;
};

// Readable from the security page itself, which someone who still has to
// enrol (or pass) their second factor is sent to; a challenged session sees
// nothing until it passes.
export async function listMySessions(): Promise<SessionView[]> {
  const user = await requireUserBeforeMfa();
  const sessionToken = user.sessionToken;
  if (!user.mfaPassed && (await confirmedTotp(user.id))) return [];
  const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id));
  return rows
    .filter((r) => r.expires > new Date())
    .map((r) => ({
      id: sessionId(r.sessionToken),
      current: r.sessionToken === sessionToken,
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
      userAgent: r.userAgent,
      ipPrefix: r.ipPrefix,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0));
}

export async function revokeSession(id: unknown): Promise<Result> {
  const user = await requireUser();
  const parsed = z.string().regex(/^[0-9a-f]{24}$/).safeParse(id);
  if (!parsed.success) return { ok: false, error: "Session not found" };
  const rows = await db.select({ token: sessions.sessionToken }).from(sessions).where(eq(sessions.userId, user.id));
  const target = rows.find((r) => sessionId(r.token) === parsed.data);
  if (!target) return { ok: false, error: "Session not found" };
  await db.delete(sessions).where(eq(sessions.sessionToken, target.token));
  revalidatePath("/account/security");
  return { ok: true };
}

export async function revokeOtherSessions(): Promise<Result> {
  const user = await requireUser();
  const { sessionToken } = await requireUserBeforeMfa();
  await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.sessionToken, sessionToken)));
  revalidatePath("/account/security");
  return { ok: true };
}

// ────────── Org owner controls ──────────

async function requireOrgOwner(orgId: string, userId: string) {
  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(and(eq(organizations.id, orgId), eq(organizations.ownerUserId, userId)));
  return org ?? null;
}

export async function setRequire2fa(input: unknown): Promise<Result> {
  const user = await requireUser();
  const parsed = z.object({ orgId: z.string().uuid(), on: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const org = await requireOrgOwner(parsed.data.orgId, user.id);
  if (!org) return { ok: false, error: "Only the organization owner can change this" };
  if (parsed.data.on && !(await confirmedTotp(user.id))) {
    return { ok: false, error: "Turn on two-factor for yourself first (Account → Security)" };
  }
  await db.update(organizations).set({ require2faForAdmins: parsed.data.on }).where(eq(organizations.id, org.id));
  await audit({
    orgId: org.id,
    actorUserId: user.id,
    action: "org.set_require_2fa",
    resourceType: "organization",
    resourceId: org.id,
    meta: { on: parsed.data.on },
  });
  revalidatePath(`/${org.slug}`, "layout");
  return { ok: true };
}

// For someone who lost their phone and their backup codes. They're signed
// out everywhere and enrol again on their next sign-in if the org requires it.
export async function resetMemberTotp(input: unknown): Promise<Result> {
  const user = await requireUser();
  const parsed = z.object({ orgId: z.string().uuid(), email: z.string().trim().toLowerCase().email().max(254) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter their email address" };
  const org = await requireOrgOwner(parsed.data.orgId, user.id);
  if (!org) return { ok: false, error: "Only the organization owner can do this" };
  const [target] = await db
    .select({ userId: users.id })
    .from(users)
    .innerJoin(members, eq(members.userId, users.id))
    .innerJoin(teams, eq(teams.id, members.teamId))
    .where(and(eq(users.email, parsed.data.email), eq(teams.orgId, org.id)))
    .limit(1);
  if (!target) return { ok: false, error: "Nobody with that email is in this organization" };
  if (target.userId === user.id) return { ok: false, error: "Use a backup code, or ask the new owner after a transfer" };
  await db.delete(userTotp).where(eq(userTotp.userId, target.userId));
  await db.delete(sessions).where(eq(sessions.userId, target.userId));
  await audit({
    orgId: org.id,
    actorUserId: user.id,
    action: "member.reset_2fa",
    resourceType: "user",
    resourceId: target.userId,
  });
  return { ok: true };
}

// Webmail domains can't be claimed: requiring SSO for gmail.com would lock
// every Gmail user out of magic links.
const PUBLIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "web.de",
  "yandex.com", "mail.com", "zoho.com", "fastmail.com",
]);

// SSO for the org's email domain: people at that domain sign in with a Google
// account managed by it, never a magic link. The domain must be the owner's
// own, and the owner must already sign in with Google, so turning it on
// can't lock the owner out.
export async function setSsoPolicy(input: unknown): Promise<Result> {
  const user = await requireUser();
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      required: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const org = await requireOrgOwner(parsed.data.orgId, user.id);
  if (!org) return { ok: false, error: "Only the organization owner can change this" };

  if (!parsed.data.required) {
    await db.update(organizations).set({ requireSso: false, ssoDomain: null }).where(eq(organizations.id, org.id));
  } else {
    if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
      return { ok: false, error: "Google sign-in isn't configured on this server" };
    }
    const domain = user.email.toLowerCase().split("@")[1] ?? "";
    if (PUBLIC_DOMAINS.has(domain)) return { ok: false, error: `${domain} is a public email provider; SSO needs your company's own domain` };
    const [google] = await db
      .select({ id: accounts.providerAccountId })
      .from(accounts)
      .where(and(eq(accounts.userId, user.id), eq(accounts.provider, "google")))
      .limit(1);
    if (!google) return { ok: false, error: "Sign in with Google once first, so you can't lock yourself out" };
    try {
      await db.update(organizations).set({ requireSso: true, ssoDomain: domain }).where(eq(organizations.id, org.id));
    } catch {
      return { ok: false, error: `${domain} is already claimed by another organization` };
    }
  }
  await audit({
    orgId: org.id,
    actorUserId: user.id,
    action: "org.set_sso",
    resourceType: "organization",
    resourceId: org.id,
    meta: { required: parsed.data.required },
  });
  revalidatePath(`/${org.slug}`, "layout");
  return { ok: true };
}
