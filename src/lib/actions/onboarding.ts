"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { members, organizations, schedules, teams, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { PRESET_RRULES, type PresetKey } from "@/lib/time";
import { requireUser } from "@/lib/session";
import { slugify } from "@/lib/slug";

const HHMM = /^\d{2}:\d{2}$/;

const CompleteSchema = z.object({
  yourName: z.string().min(1).max(80),
  orgName: z.string().min(1).max(80),
  teamName: z.string().min(1).max(80),
  scheduleName: z.string().min(1).max(80),
  preset: z.enum(["daily", "weekdays", "mwf", "weekly", "custom"]),
  customRrule: z.string().max(500).optional(),
  windowOpen: z.string().regex(HHMM),
  windowClose: z.string().regex(HHMM),
});

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
  const rl = rateLimit(`onboarding:${user.id}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) throw new Error("Too many onboarding attempts — try again later.");
  const parsed = CompleteSchema.parse({
    yourName: formData.get("yourName"),
    orgName: formData.get("orgName"),
    teamName: formData.get("teamName"),
    scheduleName: formData.get("scheduleName") || "Daily check-in",
    preset: formData.get("preset"),
    customRrule: formData.get("customRrule") || undefined,
    windowOpen: formData.get("windowOpen"),
    windowClose: formData.get("windowClose"),
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
      .values({ name: parsed.orgName, slug: orgSlug })
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

  redirect(`/${created.orgSlug}/${created.teamSlug}`);
}

// ────────── Invite ──────────

export type InviteResult =
  | { ok: true; added: string[]; alreadyIn: string[]; invalid: string[] }
  | { ok: false; error: string };

const InviteSchema = z.object({
  teamId: z.string().uuid(),
  raw: z.string().min(1).max(2000),
});

export async function inviteMembers(
  _prev: InviteResult | null,
  formData: FormData,
): Promise<InviteResult> {
  try {
    const user = await requireUser();
    const rl = rateLimit(`invite:${user.id}`, 20, 60 * 60 * 1000);
    if (!rl.allowed) return { ok: false, error: "Slow down — too many invite bursts." };
    const parsed = InviteSchema.parse({
      teamId: formData.get("teamId"),
      raw: formData.get("emails"),
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
      .select({ role: members.role, orgSlug: organizations.slug, teamSlug: teams.slug })
      .from(members)
      .innerJoin(teams, eq(teams.id, members.teamId))
      .innerJoin(organizations, eq(organizations.id, teams.orgId))
      .where(and(eq(members.teamId, parsed.teamId), eq(members.userId, user.id)));
    if (!caller || (caller.role !== "owner" && caller.role !== "admin")) {
      return { ok: false, error: "You don't have permission to invite here." };
    }

    const added: string[] = [];
    const alreadyIn: string[] = [];

    for (const email of emails) {
      const existing = await db.select().from(users).where(eq(users.email, email));
      const invitee =
        existing[0] ?? (await db.insert(users).values({ email }).returning())[0];

      const already = await db
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.teamId, parsed.teamId), eq(members.userId, invitee.id)));
      if (already.length > 0) {
        alreadyIn.push(email);
        continue;
      }

      await db
        .insert(members)
        .values({ teamId: parsed.teamId, userId: invitee.id, role: "member" });
      added.push(email);
      if (process.env.NODE_ENV !== "production") {
        console.log(`[invite] added ${email} to team ${parsed.teamId}`);
      }
    }

    if (added.length > 0) {
      // Look up orgId from the caller side (single row already fetched).
      const [orgRow] = await db
        .select({ orgId: teams.orgId })
        .from(teams)
        .where(eq(teams.id, parsed.teamId));
      if (orgRow) {
        await audit({
          orgId: orgRow.orgId,
          actorUserId: user.id,
          action: "member.invite",
          resourceType: "team",
          resourceId: parsed.teamId,
          meta: { added, alreadyIn, invalid },
        });
      }
    }

    revalidatePath(`/${caller.orgSlug}/${caller.teamSlug}`);
    return { ok: true, added, alreadyIn, invalid };
  } catch (e) {
    console.error("[invite] failed", e);
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    return { ok: false, error: msg };
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

const UpdateTzSchema = z.object({ tz: z.string().min(1).max(64) });

export async function updateOwnTz(tz: string) {
  const user = await requireUser();
  const parsed = UpdateTzSchema.parse({ tz });
  if (parsed.tz === user.tz) return;
  await db.update(users).set({ tz: parsed.tz }).where(eq(users.id, user.id));
}
