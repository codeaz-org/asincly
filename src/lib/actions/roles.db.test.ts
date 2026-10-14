import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { members, organizations, teams, users } from "@/db/schema";

// Requires local Postgres up (pnpm db:up) with migrations applied.

let currentUserId = "";
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: currentUserId, email: "", name: null, image: null, tz: "UTC" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { setMemberRole, transferOrgOwnership, transferTeamOwnership } = await import("./team-admin");

const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
let orgId: string;
let teamId: string;
const ids = { owner: "", admin: "", member: "" };
const emails = { owner: "", admin: "", member: "" };
const memberIds = { owner: "", admin: "", member: "" };

const roleOf = async (userId: string) =>
  (await db.select({ role: members.role }).from(members).where(and(eq(members.teamId, teamId), eq(members.userId, userId))))[0]
    ?.role;

beforeAll(async () => {
  process.env.BILLING_ENABLED = "false";
  for (const k of Object.keys(ids) as (keyof typeof ids)[]) {
    emails[k] = `${uniq(k)}@t.local`;
    const [u] = await db.insert(users).values({ email: emails[k], name: k }).returning();
    ids[k] = u.id;
  }
  const [org] = await db.insert(organizations).values({ name: "Roles", slug: uniq("roles"), ownerUserId: ids.owner }).returning();
  orgId = org.id;
  const [team] = await db.insert(teams).values({ orgId, name: "R", slug: "r" }).returning();
  teamId = team.id;
  const rows = await db
    .insert(members)
    .values([
      { teamId, userId: ids.owner, role: "owner" },
      { teamId, userId: ids.admin, role: "admin" },
      { teamId, userId: ids.member, role: "member" },
    ])
    .returning();
  memberIds.owner = rows[0].id;
  memberIds.admin = rows[1].id;
  memberIds.member = rows[2].id;
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  for (const id of Object.values(ids)) await db.delete(users).where(eq(users.id, id));
});

describe("roles and ownership", () => {
  it("an admin can't change roles; the team owner can", async () => {
    currentUserId = ids.admin;
    await expect(setMemberRole({ memberId: memberIds.member, role: "admin" })).rejects.toThrow(/Owner only/);
    currentUserId = ids.owner;
    expect(await setMemberRole({ memberId: memberIds.member, role: "admin" })).toEqual({ ok: true });
    expect(await roleOf(ids.member)).toBe("admin");
    expect(await setMemberRole({ memberId: memberIds.member, role: "member" })).toEqual({ ok: true });
  });

  it("nobody can demote the owner through a role change", async () => {
    currentUserId = ids.owner;
    expect(await setMemberRole({ memberId: memberIds.owner, role: "member" })).toMatchObject({ ok: false });
    expect(await roleOf(ids.owner)).toBe("owner");
  });

  it("transferring a team makes the old owner an admin", async () => {
    currentUserId = ids.owner;
    expect(await transferTeamOwnership(memberIds.admin)).toEqual({ ok: true });
    expect(await roleOf(ids.admin)).toBe("owner");
    expect(await roleOf(ids.owner)).toBe("admin");
  });

  it("the org goes only to someone who runs a team in it, and only from its owner", async () => {
    currentUserId = ids.admin;
    expect(await transferOrgOwnership({ orgId, email: emails.admin })).toMatchObject({ ok: false });
    currentUserId = ids.owner;
    expect(await transferOrgOwnership({ orgId, email: emails.member })).toMatchObject({ ok: false });
    expect(await transferOrgOwnership({ orgId, email: emails.admin })).toEqual({ ok: true });
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(org.ownerUserId).toBe(ids.admin);
  });
});
