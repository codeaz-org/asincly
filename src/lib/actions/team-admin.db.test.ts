import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { members, organizations, teams, users } from "@/db/schema";

// Requires local Postgres up (pnpm db:up) with migrations applied.

let currentUserId = "";
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: currentUserId, email: "", name: null, image: null, tz: "UTC" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { createTeam, deleteOrg } = await import("./team-admin");

const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
let orgId: string;
const ids: Record<"orgOwner" | "teamOwner" | "member" | "guest", string> = {
  orgOwner: "",
  teamOwner: "",
  member: "",
  guest: "",
};

beforeAll(async () => {
  const people = await db
    .insert(users)
    .values(Object.keys(ids).map((n) => ({ email: `${uniq(n)}@t.local`, name: n })))
    .returning();
  Object.keys(ids).forEach((k, i) => (ids[k as keyof typeof ids] = people[i].id));
  const [org] = await db
    .insert(organizations)
    .values({ name: "Authz", slug: uniq("authz"), ownerUserId: ids.orgOwner })
    .returning();
  orgId = org.id;
  const [t1] = await db.insert(teams).values({ orgId, name: "One", slug: "one" }).returning();
  const [t2] = await db.insert(teams).values({ orgId, name: "Two", slug: "two" }).returning();
  await db.insert(members).values([
    { teamId: t1.id, userId: ids.orgOwner, role: "owner" },
    { teamId: t1.id, userId: ids.member, role: "member" },
    { teamId: t1.id, userId: ids.guest, role: "guest" },
    // Owns a team, but not the org.
    { teamId: t2.id, userId: ids.teamOwner, role: "owner" },
  ]);
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  for (const id of Object.values(ids)) await db.delete(users).where(eq(users.id, id));
});

const form = (name: string) => {
  const fd = new FormData();
  fd.set("name", name);
  return fd;
};

describe("org authorization", () => {
  it("guests and members cannot create a team (and with it an owner role)", async () => {
    for (const who of [ids.guest, ids.member]) {
      currentUserId = who;
      await expect(createTeam(orgId, form("Escalate"))).rejects.toThrow(/owners and admins/);
    }
    const all = await db.select().from(teams).where(eq(teams.orgId, orgId));
    expect(all.map((t) => t.name).sort()).toEqual(["One", "Two"]);
  });

  it("owning a team does not let you delete the org", async () => {
    currentUserId = ids.teamOwner;
    await expect(deleteOrg(orgId)).rejects.toThrow(/organization owner/);
    const [still] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(still).toBeDefined();
  });

  it("the org owner can delete it", async () => {
    currentUserId = ids.orgOwner;
    await expect(deleteOrg(orgId)).rejects.toThrow("redirect:/");
    const rows = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(rows).toHaveLength(0);
  });
});
