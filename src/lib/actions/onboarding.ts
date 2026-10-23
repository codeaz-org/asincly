"use server";

import { LEGAL_VERSION } from "@/lib/legal";
import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { invitations, members, organizations, schedules, teams, users } from "@/db/schema";
import { parseAttribution } from "@/lib/attribution";
import { audit } from "@/lib/audit";
import { assertCanAddMembers, assertFeature, ensureOrgBilling, limitResult } from "@/lib/billing/entitlements";
import { isBillingEnabled } from "@/lib/billing/plans";
import { displayName } from "@/lib/display";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { PRESET_RRULES, isValidTimeZone, type PresetKey } from "@/lib/time";
import { customRrule, hhmm, withWindowLength } from "@/lib/validation/schedule";
import { requireUser } from "@/lib/session";
import { slugify } from "@/lib/slug";
import { InviteRoleSchema } from "@/lib/validation/billing";


const CompleteSchema = withWindowLength(
  z.object({
    yourName: z.string().min(1).max(80),
    orgName: z.string().min(1).max(80),
    teamName: z.string().min(1).max(80),
    scheduleName: z.string().min(1).max(80),
    preset: z.enum(["daily", "weekdays", "mwf", "weekly", "custom"]),
    customRrule: customRrule.optional(),
    windowOpen: hhmm,
    windowClose: hhmm,
    // Whoever creates the organization accepts the Terms and DPA for it.
    acceptTerms: z.literal("on", { message: "Accept the Terms and the Data Processing Agreement to continue." }),
  }),
);

async function uniqueOrgSlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 0; i < 10; i++) {
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug));
    if (existing.length === 0) return slug;
    slug = `${base}-${Math.random().toString(36).slice(2, 5)}`;
  }
  throw new Error("Could not allocate a unique org slug");
}

export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();
  const rl = await rateLimit(`onboarding:${user.id}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) throw new Error("Too many onboarding attempts — try again later.");
  // Each new org gets a Pro trial; owning a handful is plenty for anyone.
  const owned = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.ownerUserId, user.id));
  if (owned.length >= 10) throw new Error("You already own 10 organizations. Delete one to create another.");
  const parsed = CompleteSchema.parse({
    yourName: formData.get("yourName"),
    orgName: formData.get("orgName"),
    teamName: formData.get("teamName"),
    scheduleName: formData.get("scheduleName") || "Daily check-in",
    preset: formData.get("preset"),
    customRrule: formData.get("customRrule") || undefined,
    windowOpen: formData.get("windowOpen"),
    windowClose: formData.get("windowClose"),
    acceptTerms: formData.get("acceptTerms"),
  });

  const rrule =
    parsed.preset === "custom"
      ? (parsed.customRrule ?? "").trim()
      : PRESET_RRULES[parsed.preset as PresetKey];
  if (!rrule) throw new Error("A custom RRULE is required when preset=custom");

  await db.update(users).set({ name: parsed.yourName }).where(eq(users.id, user.id));

  const orgSlug = await uniqueOrgSlug(slugify(parsed.orgName));
  const teamSlug = slugify(parsed.teamName);

  const created = await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({
        name: parsed.orgName,
        slug: orgSlug,
        ownerUserId: user.id,
        termsVersion: LEGAL_VERSION,
        termsAcceptedAt: new Date(),
        termsAcceptedBy: user.id,
        acquisition: parseAttribution(formData),
      })
      .returning();
    const [team] = await tx
      .insert(teams)
      .values({ orgId: org.id, name: parsed.teamName, slug: teamSlug })
      .returning();
    await tx.insert(members).values({ teamId: team.id, userId: user.id, role: "owner" });
    await tx.insert(schedules).values({
      teamId: team.id,
      name: parsed.scheduleName,
      rrule,
      windowOpenLocal: parsed.windowOpen,
      windowCloseLocal: parsed.windowClose,
    });
    return { orgSlug: org.slug, teamSlug: team.slug, orgId: org.id, teamId: team.id };
  });

  await audit({
    orgId: created.orgId,
    actorUserId: user.id,
    action: "org.create",
    resourceType: "organization",
    resourceId: created.orgId,
    meta: { name: parsed.orgName, teamName: parsed.teamName },
  });
  // Hosted cloud: every new organization starts on a 14-day Pro trial.
  if (isBillingEnabled()) await ensureOrgBilling(created.orgId);

  redirect(`/${created.orgSlug}/${created.teamSlug}`);
}

// ────────── Invite ──────────

export type InviteResult =
  | { ok: true; added: string[]; alreadyIn: string[]; invalid: string[] }
  | { ok: false; error: string; upgrade?: boolean };

const INVITE_TTL_MS = 14 * 24 * 3600 * 1000;

const InviteSchema = z.object({
  teamId: z.string().uuid(),
  raw: z.string().min(1).max(2000),
  role: InviteRoleSchema,
});

export async function inviteMembers(
  _prev: InviteResult | null,
  formData: FormData,
): Promise<InviteResult> {
  try {
    const user = await requireUser();
    const rl = await rateLimit(`invite:${user.id}`, 20, 60 * 60 * 1000);
    if (!rl.allowed) return { ok: false, error: "Slow down — too many invite bursts." };
    const parsed = InviteSchema.parse({
      teamId: formData.get("teamId"),
      raw: formData.get("emails"),
      role: formData.get("role") || undefined,
    });

    const tokens = parsed.raw
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const invalid = tokens.filter((e) => !z.string().email().safeParse(e).success);
    const emails = Array.from(
      new Set(tokens.filter((e) => z.string().email().safeParse(e).success)),
    ).slice(0, 50);

    if (emails.length === 0) {
      return { ok: false, error: "No valid email addresses found." };
    }

    const [caller] = await db
      .select({ role: members.role, orgId: teams.orgId, orgSlug: organizations.slug, teamSlug: teams.slug })
      .from(members)
      .innerJoin(teams, eq(teams.id, members.teamId))
      .innerJoin(organizations, eq(organizations.id, teams.orgId))
      .where(and(eq(members.teamId, parsed.teamId), eq(members.userId, user.id)));
    if (!caller || (caller.role !== "owner" && caller.role !== "admin")) {
      return { ok: false, error: "You don't have permission to invite here." };
    }

    // Plan limits (hosted cloud only): guests are a Pro feature; members count
    // as seats unless they already hold one elsewhere in the organization.
    try {
      if (parsed.role === "guest") {
        await assertFeature(caller.orgId, "guests");
      } else {
        const known = await db.select({ id: users.id }).from(users).where(inArray(users.email, emails));
        const seated = known.length
          ? await db
              .selectDistinct({ userId: members.userId })
              .from(members)
              .innerJoin(teams, eq(teams.id, members.teamId))
              .where(
                and(
                  eq(teams.orgId, caller.orgId),
                  ne(members.role, "guest"),
                  inArray(
                    members.userId,
                    known.map((k) => k.id),
                  ),
                ),
              )
          : [];
        await assertCanAddMembers(caller.orgId, emails.length - seated.length);
      }
    } catch (e) {
      const limited = limitResult(e);
      if (limited && !limited.ok) return { ok: false, error: limited.error, upgrade: true };
      throw e;
    }

    const [inviter] = await db
      .select({ name: users.name, email: users.email, team: teams.name })
      .from(users)
      .innerJoin(teams, eq(teams.id, parsed.teamId))
      .where(eq(users.id, user.id));
    const app = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

    const added: string[] = [];
    const alreadyIn: string[] = [];

    for (const email of emails) {
      const already = await db
        .select({ id: members.id })
        .from(members)
        .innerJoin(users, eq(users.id, members.userId))
        .where(and(eq(members.teamId, parsed.teamId), eq(users.email, email)));
      if (already.length > 0) {
        alreadyIn.push(email);
        continue;
      }

      // Nobody joins a team without saying yes: the invite waits until they
      // sign in with this address and accept. A pending invite isn't mailed
      // again, so re-inviting can't be used to flood an inbox.
      const [pending] = await db
        .select({ expiresAt: invitations.expiresAt })
        .from(invitations)
        .where(and(eq(invitations.teamId, parsed.teamId), eq(invitations.email, email)));
      const fresh = !pending || pending.expiresAt < new Date();
      await db
        .insert(invitations)
        .values({ teamId: parsed.teamId, email, role: parsed.role, invitedByUserId: user.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
        .onConflictDoUpdate({
          target: [invitations.teamId, invitations.email],
          set: { role: parsed.role, invitedByUserId: user.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
        });
      added.push(email);
      if (fresh && inviter) {
        const who = displayName(inviter.name, inviter.email);
        await sendEmail({
          to: email,
          subject: `${who} invited you to ${inviter.team} on Asincly`,
          text: `Asincly is where ${inviter.team} posts short async check-ins instead of meeting.\n\nSign in with ${email} to accept. The invite is open for 14 days; if you weren't expecting it, ignore this email.`,
          action: { label: "See the invite", url: `${app}/invites` },
        }).catch((e) => console.error("[invite] email failed", e instanceof Error ? e.message : "unknown error"));
      }
    }

    if (added.length > 0) {
      await audit({
        orgId: caller.orgId,
        actorUserId: user.id,
        action: "member.invite",
        resourceType: "team",
        resourceId: parsed.teamId,
        meta: { invited: added, alreadyIn, invalid, role: parsed.role },
      });
    }

    revalidatePath(`/${caller.orgSlug}/${caller.teamSlug}`);
    return { ok: true, added, alreadyIn, invalid };
  } catch (e) {
    // The message stays in the log: database errors carry SQL and values.
    console.error("[invite] failed", e instanceof Error ? e.message : "unknown error");
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

// Invitees skip onboarding; the app shell shows a one-field banner that
// posts here until a name exists.
export async function setName(formData: FormData) {
  const user = await requireUser();
  const name = z.string().min(1).max(80).parse(formData.get("name"));
  await db.update(users).set({ name }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
}

const UpdateTzSchema = z.object({ tz: z.string().min(1).max(64).refine(isValidTimeZone, "Unknown time zone") });

export async function updateOwnTz(tz: string) {
  const user = await requireUser();
  const parsed = UpdateTzSchema.parse({ tz });
  if (parsed.tz === user.tz) return;
  await db.update(users).set({ tz: parsed.tz }).where(eq(users.id, user.id));
}
