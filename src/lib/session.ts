import { clientIp } from "@/lib/rate-limit";
import { and, eq, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { db } from "@/db";
import { withUser } from "@/db/with-user";
import { members, organizations, sessions, teams, users, userTotp } from "@/db/schema";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  tz: string;
};

// The signed-in user, once their second factor is satisfied: someone who
// enrolled TOTP must pass it in this session, and an owner/admin of an org
// that requires 2FA must enrol. Everything app-facing uses this.
export async function requireUser(): Promise<SessionUser> {
  const s = await currentSession();
  if (!s) redirect("/sign-in");
  if (s.totpConfirmed && !s.mfaAt) redirect("/account/2fa");
  if (!s.totpConfirmed && s.mustEnrol) redirect("/account/security?required=1");
  return s.user;
}

// Signed in, second factor not yet checked: only for the pages that collect
// it (/account/2fa, /account/security).
export async function requireUserBeforeMfa(): Promise<SessionUser & { sessionToken: string; mfaPassed: boolean }> {
  const s = await currentSession();
  if (!s) redirect("/sign-in");
  return { ...s.user, sessionToken: s.token, mfaPassed: !!s.mfaAt };
}

// Auth.js names the cookie with a __Secure- prefix over https.
export async function sessionTokenFromCookies(): Promise<string | null> {
  const jar = await cookies();
  return jar.get("__Secure-authjs.session-token")?.value ?? jar.get("authjs.session-token")?.value ?? null;
}

// One query per request (cached): the user, this session's row, whether
// they've enrolled TOTP, and whether an org they run requires it.
const currentSession = cache(async () => {
  const session = await auth();
  const token = await sessionTokenFromCookies();
  if (!session?.user?.id || !token) return null;
  const [row] = await db
    .select({
      user: users,
      mfaAt: sessions.mfaAt,
      lastSeenAt: sessions.lastSeenAt,
      userAgent: sessions.userAgent,
      totpConfirmed: sql<boolean>`exists (select 1 from ${userTotp} where ${userTotp.userId} = ${users.id} and ${userTotp.confirmedAt} is not null)`,
      mustEnrol: sql<boolean>`exists (
        select 1 from ${members} m join ${teams} t on t.id = m.team_id join ${organizations} o on o.id = t.org_id
        where m.user_id = ${users.id} and m.role in ('owner','admin') and o.require_2fa_for_admins)`,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.sessionToken, token), eq(sessions.userId, session.user.id)));
  if (!row) return null;

  // Last seen, at most every 5 minutes; device details the first time.
  const now = new Date();
  if (!row.lastSeenAt || now.getTime() - row.lastSeenAt.getTime() > 5 * 60_000) {
    const h = await headers();
    await db
      .update(sessions)
      .set({
        lastSeenAt: now,
        ...(row.userAgent ? {} : { userAgent: h.get("user-agent")?.slice(0, 300) ?? null, ipPrefix: ipPrefix(h) }),
      })
      .where(eq(sessions.sessionToken, token));
  }

  const u = row.user;
  return {
    token,
    mfaAt: row.mfaAt,
    totpConfirmed: row.totpConfirmed,
    mustEnrol: row.mustEnrol,
    user: { id: u.id, email: u.email, name: u.name, image: u.image, tz: u.tz } satisfies SessionUser,
  };
});

// The client's network, not their address: enough to tell "office" from
// "somewhere else" on the sessions page.
function ipPrefix(h: Headers): string | null {
  const ip = clientIp(h);
  if (ip === "unknown") return null;
  if (ip === "::1" || ip.startsWith("127.")) return "localhost";
  if (ip.includes(".")) return ip.split(".").slice(0, 3).join(".") + ".0";
  return ip.split(":").slice(0, 4).join(":") + "::";
}

export async function getMemberships(userId: string) {
  return withUser(userId, (tx) =>
    tx
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
      .where(eq(members.userId, userId)),
  );
}

// Team slugs are only unique inside an org, so pass `orgSlug` whenever the
// URL has one; without it two orgs with a "platform" team would collide.
export async function getTeamBySlug(userId: string, teamSlug: string, orgSlug?: string) {
  const rows = await withUser(userId, (tx) =>
    tx
      .select({
        teamId: teams.id,
        teamName: teams.name,
        teamSlug: teams.slug,
        requireVideo: teams.requireVideo,
        orgId: organizations.id,
        orgName: organizations.name,
        orgOwnerUserId: organizations.ownerUserId,
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
      ),
  );
  const row = rows[0];
  if (!row) return null;
  const { orgOwnerUserId, ...rest } = row;
  return { ...rest, isOrgOwner: orgOwnerUserId === userId };
}
