"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { members, organizations, schedules, teams, users } from "@/db/schema";
import { PRESET_RRULES, type PresetKey } from "@/lib/time";
import { requireUser } from "@/lib/session";
import { slugify } from "@/lib/slug";
import { withUser } from "@/db/with-user";

const HHMM = /^\d{2}:\d{2}$/;

const CompleteSchema = z.object({
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
    const existing = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
    if (existing.length === 0) return slug;
    slug = `${base}-${Math.random().toString(36).slice(2, 5)}`;
  }
  throw new Error("Could not allocate a unique org slug");
}

export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();
  const parsed = CompleteSchema.parse({
    orgName: formData.get("orgName"),
    teamName: formData.get("teamName"),
    scheduleName: formData.get("scheduleName") || "Daily standup",
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

  const orgSlug = await uniqueOrgSlug(slugify(parsed.orgName));
  const teamSlug = slugify(parsed.teamName);

  const created = await withUser(user.id, async (tx) => {
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
    return { orgSlug: org.slug, teamSlug: team.slug };
  });

  redirect(`/${created.orgSlug}/${created.teamSlug}`);
}

const InviteSchema = z.object({
  teamId: z.string().uuid(),
  emails: z
    .string()
    .transform((s) => s.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.string().email()).min(1).max(50)),
});

export async function inviteMembers(formData: FormData) {
  const user = await requireUser();
  const parsed = InviteSchema.parse({
    teamId: formData.get("teamId"),
    emails: formData.get("emails"),
  });

  for (const email of parsed.emails) {
    // Ensure a user row exists for this email. Auth.js will attach the
    // account on first sign-in via magic link; we're pre-creating the row
    // so we can insert a member reference now.
    const existing = await db.select().from(users).where(eq(users.email, email));
    const invitee = existing[0] ?? (await db.insert(users).values({ email }).returning())[0];

    const already = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.teamId, parsed.teamId), eq(members.userId, invitee.id)));
    if (already.length > 0) continue;

    await withUser(user.id, (tx) =>
      tx.insert(members).values({ teamId: parsed.teamId, userId: invitee.id, role: "member" }),
    );
    // ponytail: no invite email yet. In dev they can /sign-in with the same
    // email and land in the team. Wire Resend invite template in Phase 4.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[invite] added ${email} to team ${parsed.teamId}`);
    }
  }
}

const UpdateTzSchema = z.object({ tz: z.string().min(1).max(64) });

export async function updateOwnTz(tz: string) {
  const user = await requireUser();
  const parsed = UpdateTzSchema.parse({ tz });
  if (parsed.tz === user.tz) return;
  await db.update(users).set({ tz: parsed.tz }).where(eq(users.id, user.id));
}
