import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./index";
import {
  blockerActions,
  orgBilling,
  slackInstalls,
  checkInComments,
  checkInReactions,
  checkIns,
  memberAway,
  members,
  occurrences,
  organizations,
  schedules,
  teams,
  users,
} from "./schema";
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
let userCId: string;
let checkInAId: string;

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

  // Social layer fixture: C joins team A; A has a submitted check-in.
  const [uC] = await db
    .insert(users)
    .values({ email: uniq("c") + "@t.local", name: "C" })
    .returning();
  userCId = uC.id;
  await db.insert(members).values({ teamId: teamAId, userId: userCId, role: "member" });
  const [sched] = await db
    .insert(schedules)
    .values({ teamId: teamAId, name: "Daily", rrule: "FREQ=DAILY", windowOpenLocal: "09:00", windowCloseLocal: "11:00" })
    .returning();
  const [occ] = await db
    .insert(occurrences)
    .values({ scheduleId: sched.id, scheduleDate: "2026-09-14" })
    .returning();
  const [ci] = await db
    .insert(checkIns)
    .values({
      occurrenceId: occ.id,
      userId: userAId,
      localDate: "2026-09-14",
      blockers: "- waiting on keys",
      status: "submitted",
      submittedAt: new Date(),
    })
    .returning();
  checkInAId = ci.id;

  cleanup.push(
    () => db.delete(users).where(eq(users.id, userCId)),
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
    expect(asA.map((m) => m.userId).sort()).toEqual([userAId, userCId].sort());
    expect(asA.some((m) => m.userId === userBId)).toBe(false);
  });

  it("blocks writes to other teams", async () => {
    await expect(
      withUser(userAId, (tx) =>
        tx.insert(members).values({ teamId: teamBId, userId: userAId, role: "member" }),
      ),
    ).rejects.toThrow();
  });
});

describe("row-level security: social layer", () => {
  it("lets teammates comment and react, hides it from other teams", async () => {
    await withUser(userCId, (tx) =>
      tx.insert(checkInComments).values({ checkInId: checkInAId, userId: userCId, body: "nice" }),
    );
    await withUser(userCId, (tx) =>
      tx.insert(checkInReactions).values({ checkInId: checkInAId, userId: userCId, emoji: "🎉" }),
    );
    const asA = await withUser(userAId, (tx) => tx.select().from(checkInComments));
    const asB = await withUser(userBId, (tx) => tx.select().from(checkInComments));
    const reactionsAsB = await withUser(userBId, (tx) => tx.select().from(checkInReactions));
    expect(asA.some((c) => c.checkInId === checkInAId)).toBe(true);
    expect(asB).toEqual([]);
    expect(reactionsAsB).toEqual([]);
  });

  it("blocks outsiders from commenting and impersonation", async () => {
    await expect(
      withUser(userBId, (tx) =>
        tx.insert(checkInComments).values({ checkInId: checkInAId, userId: userBId, body: "hi" }),
      ),
    ).rejects.toThrow();
    await expect(
      withUser(userCId, (tx) =>
        tx.insert(checkInComments).values({ checkInId: checkInAId, userId: userAId, body: "as A" }),
      ),
    ).rejects.toThrow();
  });

  it("only lets authors delete their own comments", async () => {
    const [c] = await withUser(userCId, (tx) =>
      tx
        .insert(checkInComments)
        .values({ checkInId: checkInAId, userId: userCId, body: "keep me" })
        .returning(),
    );
    const deletedByA = await withUser(userAId, (tx) =>
      tx.delete(checkInComments).where(eq(checkInComments.id, c.id)).returning(),
    );
    expect(deletedByA).toEqual([]);
    const [still] = await db.select().from(checkInComments).where(eq(checkInComments.id, c.id));
    expect(still?.body).toBe("keep me");
  });

  it("lets teammates offer help but only the author resolve", async () => {
    await withUser(userCId, (tx) =>
      tx.insert(blockerActions).values({ checkInId: checkInAId, itemKey: "0000abcd", userId: userCId, kind: "help" }),
    );
    await expect(
      withUser(userCId, (tx) =>
        tx
          .insert(blockerActions)
          .values({ checkInId: checkInAId, itemKey: "0000abcd", userId: userCId, kind: "resolved" }),
      ),
    ).rejects.toThrow();
    await withUser(userAId, (tx) =>
      tx
        .insert(blockerActions)
        .values({ checkInId: checkInAId, itemKey: "0000abcd", userId: userAId, kind: "resolved" }),
    );
    const asB = await withUser(userBId, (tx) => tx.select().from(blockerActions));
    expect(asB).toEqual([]);
  });

  it("scopes away periods to the team and to the owner for writes", async () => {
    await withUser(userCId, (tx) =>
      tx.insert(memberAway).values({ teamId: teamAId, userId: userCId, startsOn: "2026-09-14", endsOn: "2026-09-16" }),
    );
    await expect(
      withUser(userCId, (tx) =>
        tx.insert(memberAway).values({ teamId: teamAId, userId: userAId, startsOn: "2026-09-14", endsOn: "2026-09-16" }),
      ),
    ).rejects.toThrow();
    const asA = await withUser(userAId, (tx) => tx.select().from(memberAway));
    const asB = await withUser(userBId, (tx) => tx.select().from(memberAway));
    expect(asA.some((r) => r.userId === userCId)).toBe(true);
    expect(asB).toEqual([]);
  });

  it("only allows reply reactions that belong to the same check-in", async () => {
    const [c] = await withUser(userCId, (tx) =>
      tx.insert(checkInComments).values({ checkInId: checkInAId, userId: userCId, body: "react to me" }).returning(),
    );
    await withUser(userAId, (tx) =>
      tx.insert(checkInReactions).values({ checkInId: checkInAId, commentId: c.id, userId: userAId, emoji: "👍" }),
    );
    // Pointing a reaction at a reply while claiming a different check-in fails.
    const [other] = await db
      .insert(checkIns)
      .values({
        occurrenceId: (await db.select().from(checkIns).where(eq(checkIns.id, checkInAId)))[0].occurrenceId,
        userId: userCId,
        localDate: "2026-09-14",
        status: "submitted",
        submittedAt: new Date(),
      })
      .returning();
    await expect(
      withUser(userAId, (tx) =>
        tx.insert(checkInReactions).values({ checkInId: other.id, commentId: c.id, userId: userAId, emoji: "🎉" }),
      ),
    ).rejects.toThrow();
    const asB = await withUser(userBId, (tx) => tx.select().from(checkInReactions));
    expect(asB).toEqual([]);
  });
});

describe("row-level security: guests and billing", () => {
  let guestId: string;

  beforeAll(async () => {
    const [g] = await db
      .insert(users)
      .values({ email: uniq("guest") + "@t.local", name: "Guest" })
      .returning();
    guestId = g.id;
    await db.insert(members).values({ teamId: teamAId, userId: guestId, role: "guest" });
    await db.insert(orgBilling).values({ orgId: orgAId, plan: "pro", status: "trialing" });
    cleanup.unshift(() => db.delete(users).where(eq(users.id, guestId)));
  });

  it("lets a guest read and reply but not check in", async () => {
    const readable = await withUser(guestId, (tx) => tx.select().from(checkIns));
    expect(readable.some((c) => c.id === checkInAId)).toBe(true);

    await withUser(guestId, (tx) =>
      tx.insert(checkInComments).values({ checkInId: checkInAId, userId: guestId, body: "Nice work" }),
    );

    const [ci] = await db.select().from(checkIns).where(eq(checkIns.id, checkInAId));
    await expect(
      withUser(guestId, (tx) =>
        tx.insert(checkIns).values({ occurrenceId: ci.occurrenceId, userId: guestId, localDate: "2026-09-14" }),
      ),
    ).rejects.toThrow();
    await expect(
      withUser(guestId, (tx) =>
        tx.insert(memberAway).values({ teamId: teamAId, userId: guestId, startsOn: "2026-09-14", endsOn: "2026-09-15" }),
      ),
    ).rejects.toThrow();
  });

  it("shows billing only to the organization and never lets the app role write it", async () => {
    const asA = await withUser(userAId, (tx) => tx.select().from(orgBilling));
    const asB = await withUser(userBId, (tx) => tx.select().from(orgBilling));
    expect(asA.map((b) => b.orgId)).toContain(orgAId);
    expect(asB.some((b) => b.orgId === orgAId)).toBe(false);
    const updated = await withUser(userAId, (tx) =>
      tx.update(orgBilling).set({ plan: "free" }).where(eq(orgBilling.orgId, orgAId)).returning(),
    );
    expect(updated).toEqual([]);
  });
});

describe("row-level security: slack_install", () => {
  it("is visible to team admins only and never writable by the app role", async () => {
    await db.insert(slackInstalls).values({
      teamId: teamAId,
      slackTeamId: "T1",
      slackTeamName: "Acme",
      botUserId: "B1",
      botTokenCipher: "cipher",
    });
    try {
      const asOwner = await withUser(userAId, (tx) => tx.select().from(slackInstalls));
      const asMember = await withUser(userCId, (tx) => tx.select().from(slackInstalls));
      const asOutsider = await withUser(userBId, (tx) => tx.select().from(slackInstalls));
      expect(asOwner.map((r) => r.teamId)).toEqual([teamAId]);
      expect(asMember).toEqual([]);
      expect(asOutsider).toEqual([]);
      const updated = await withUser(userAId, (tx) =>
        tx.update(slackInstalls).set({ channelId: "C1" }).where(eq(slackInstalls.teamId, teamAId)).returning(),
      );
      expect(updated).toEqual([]);
    } finally {
      await db.delete(slackInstalls).where(eq(slackInstalls.teamId, teamAId));
    }
  });
});

