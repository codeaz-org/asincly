import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { members, organizations, teams, users } from "@/db/schema";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  tz: string;
};

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const [u] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!u) redirect("/sign-in");
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    tz: u.tz,
  };
}

export async function getMemberships(userId: string) {
  return db
    .select({
      memberId: members.id,
      role: members.role,
      teamId: teams.id,
      teamName: teams.name,
      teamSlug: teams.slug,
      orgId: organizations.id,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(eq(members.userId, userId));
}

// Team slugs are only unique inside an org, so pass `orgSlug` whenever the
// URL has one; without it two orgs with a "platform" team would collide.
export async function getTeamBySlug(userId: string, teamSlug: string, orgSlug?: string) {
  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      teamSlug: teams.slug,
      requireVideo: teams.requireVideo,
      orgId: organizations.id,
      orgName: organizations.name,
      role: members.role,
    })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(
      and(
        eq(members.userId, userId),
        eq(teams.slug, teamSlug),
        orgSlug ? eq(organizations.slug, orgSlug) : undefined,
      ),
    );
  return rows[0] ?? null;
}
