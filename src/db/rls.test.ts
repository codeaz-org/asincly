import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./index";
import { members, organizations, teams, users } from "./schema";
import { withUser } from "./with-user";

// Requires local Postgres up (pnpm db:up) with migrations applied.
// The test seeds two orgs with disjoint users, then verifies that a user
// running under withUser() can only see their own org and team.

const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

let userAId: string;
let userBId: string;
let orgAId: string;
let orgBId: string;
let teamAId: string;
let teamBId: string;

const cleanup: Array<() => Promise<unknown>> = [];

beforeAll(async () => {
  const [uA] = await db
    .insert(users)
    .values({ email: uniq("a") + "@t.local", name: "A" })
    .returning();
  const [uB] = await db
    .insert(users)
    .values({ email: uniq("b") + "@t.local", name: "B" })
    .returning();
  userAId = uA.id;
  userBId = uB.id;

  const [oA] = await db
    .insert(organizations)
    .values({ name: "OrgA", slug: uniq("orga") })
    .returning();
  const [oB] = await db
    .insert(organizations)
    .values({ name: "OrgB", slug: uniq("orgb") })
    .returning();
  orgAId = oA.id;
  orgBId = oB.id;

  const [tA] = await db
    .insert(teams)
    .values({ orgId: orgAId, name: "TeamA", slug: "team" })
    .returning();
  const [tB] = await db
    .insert(teams)
    .values({ orgId: orgBId, name: "TeamB", slug: "team" })
    .returning();
  teamAId = tA.id;
  teamBId = tB.id;

  await db.insert(members).values([
    { teamId: teamAId, userId: userAId, role: "owner" },
    { teamId: teamBId, userId: userBId, role: "owner" },
  ]);

  cleanup.push(
    () => db.delete(organizations).where(eq(organizations.id, orgAId)),
    () => db.delete(organizations).where(eq(organizations.id, orgBId)),
    () => db.delete(users).where(eq(users.id, userAId)),
    () => db.delete(users).where(eq(users.id, userBId)),
  );
});

afterAll(async () => {
  for (const fn of cleanup) await fn();
});

describe("row-level security", () => {
  it("scopes organization reads to the caller's memberships", async () => {
    const asA = await withUser(userAId, (tx) => tx.select().from(organizations));
    const asB = await withUser(userBId, (tx) => tx.select().from(organizations));
    expect(asA.map((o) => o.id)).toEqual([orgAId]);
    expect(asB.map((o) => o.id)).toEqual([orgBId]);
  });

  it("scopes team reads to the caller's org", async () => {
    const asA = await withUser(userAId, (tx) => tx.select().from(teams));
    expect(asA.map((t) => t.id)).toEqual([teamAId]);
    expect(asA.every((t) => t.orgId === orgAId)).toBe(true);
  });

  it("scopes member reads to the caller's team", async () => {
    const asA = await withUser(userAId, (tx) => tx.select().from(members));
    expect(asA.map((m) => m.userId)).toEqual([userAId]);
  });

  it("blocks writes to other teams", async () => {
    await expect(
      withUser(userAId, (tx) =>
        tx.insert(members).values({ teamId: teamBId, userId: userAId, role: "member" }),
      ),
    ).rejects.toThrow();
  });
});
