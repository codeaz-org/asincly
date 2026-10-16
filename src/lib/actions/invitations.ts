"use server";

import { and, eq, gt, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { invitations, members, organizations, teams } from "@/db/schema";
import { audit } from "@/lib/audit";
import { assertCanAddMembers, assertFeature, limitResult } from "@/lib/billing/entitlements";
import { syncSeats } from "@/lib/billing/seats";
import { requireUser } from "@/lib/session";

// Invites for the signed-in address. Signing in with it is the proof the
// invite reached its owner, so there's no token to leak or forward. Takes no
// argument: every export here is callable from the browser.
export async function listMyInvitations() {
  const { email } = await requireUser();
  return db
    .select({ id: invitations.id, role: invitations.role, team: teams.name, org: organizations.name })
    .from(invitations)
    .innerJoin(teams, eq(teams.id, invitations.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(and(eq(invitations.email, email.toLowerCase()), gt(invitations.expiresAt, new Date())));
}

async function mine(id: unknown, email: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return null;
  const [inv] = await db
    .select({ id: invitations.id, teamId: invitations.teamId, role: invitations.role, orgId: teams.orgId, orgSlug: organizations.slug, teamSlug: teams.slug })
    .from(invitations)
    .innerJoin(teams, eq(teams.id, invitations.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(and(eq(invitations.id, parsed.data), eq(invitations.email, email.toLowerCase()), gt(invitations.expiresAt, new Date())));
  return inv ?? null;
}

export async function acceptInvitation(formData: FormData): Promise<void> {
  const user = await requireUser();
  const inv = await mine(formData.get("id"), user.email);
  if (!inv) redirect("/invites?gone=1");

  // Plan limits are checked again here: seats may have filled since the invite.
  try {
    if (inv.role === "guest") {
      await assertFeature(inv.orgId, "guests");
    } else {
      const [seated] = await db
        .select({ id: members.id })
        .from(members)
        .innerJoin(teams, eq(teams.id, members.teamId))
        .where(and(eq(teams.orgId, inv.orgId), eq(members.userId, user.id), ne(members.role, "guest")))
        .limit(1);
      if (!seated) await assertCanAddMembers(inv.orgId, 1);
    }
  } catch (e) {
    if (limitResult(e)) redirect("/invites?full=1");
    throw e;
  }

  await db.transaction(async (tx) => {
    await tx.insert(members).values({ teamId: inv.teamId, userId: user.id, role: inv.role }).onConflictDoNothing();
    await tx.delete(invitations).where(eq(invitations.id, inv.id));
  });
  await audit({ orgId: inv.orgId, actorUserId: user.id, action: "member.join", resourceType: "team", resourceId: inv.teamId });
  await syncSeats(inv.orgId);
  redirect(`/${inv.orgSlug}/${inv.teamSlug}`);
}

export async function declineInvitation(formData: FormData): Promise<void> {
  const user = await requireUser();
  const inv = await mine(formData.get("id"), user.email);
  if (inv) await db.delete(invitations).where(eq(invitations.id, inv.id));
  redirect("/invites");
}
