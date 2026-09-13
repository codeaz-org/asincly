import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { BrowserContext } from "@playwright/test";
import {
  checkIns,
  members,
  occurrences,
  organizations,
  schedules,
  sessions,
  teams,
  users,
} from "../src/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for e2e fixtures");

const client = postgres(url, { max: 3, prepare: false });
export const testDb = drizzle(client);

const rand = () => Math.random().toString(36).slice(2, 8);

export async function seedUserWithSession(emailPrefix: string) {
  const email = `${emailPrefix}-${Date.now()}-${rand()}@e2e.local`;
  const [user] = await testDb
    .insert(users)
    .values({ email, emailVerified: new Date(), tz: "UTC" })
    .returning();
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await testDb.insert(sessions).values({ sessionToken, userId: user.id, expires });
  return { user, sessionToken };
}

export async function seedOrgWithTeam(userId: string) {
  const [org] = await testDb
    .insert(organizations)
    .values({ name: `E2E Org ${rand()}`, slug: `e2e-${rand()}${rand()}` })
    .returning();
  const [team] = await testDb
    .insert(teams)
    .values({ orgId: org.id, name: "Platform", slug: "platform" })
    .returning();
  await testDb
    .insert(members)
    .values({ teamId: team.id, userId, role: "owner" });
  await testDb.insert(schedules).values({
    teamId: team.id,
    name: "Daily",
    rrule: "FREQ=DAILY",
    windowOpenLocal: "00:00",
    windowCloseLocal: "23:59",
  });
  return { org, team };
}

export async function addToTeam(teamId: string, userId: string) {
  await testDb
    .insert(members)
    .values({ teamId, userId, role: "member" });
}

export async function setUserName(userId: string, name: string) {
  await testDb.update(users).set({ name }).where(eq(users.id, userId));
}

// Auth.js v5 dev cookie name — no __Secure- prefix without HTTPS.
export async function signInAs(context: BrowserContext, sessionToken: string) {
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: sessionToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

export async function cleanup() {
  await client.end();
}

// A submitted check-in on today's (UTC) occurrence of the team's schedule.
export async function seedSubmittedCheckIn(
  teamId: string,
  userId: string,
  fields: { yesterday?: string; today?: string; blockers?: string },
  daysAgo = 0,
) {
  const [schedule] = await testDb.select().from(schedules).where(eq(schedules.teamId, teamId));
  const today = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
  const [occ] = await testDb
    .insert(occurrences)
    .values({ scheduleId: schedule.id, scheduleDate: today })
    .onConflictDoUpdate({
      target: [occurrences.scheduleId, occurrences.scheduleDate],
      set: { scheduleDate: today },
    })
    .returning();
  const [ci] = await testDb
    .insert(checkIns)
    .values({
      occurrenceId: occ.id,
      userId,
      localDate: today,
      status: "submitted",
      submittedAt: new Date(),
      yesterday: fields.yesterday ?? "",
      today: fields.today ?? "",
      blockers: fields.blockers ?? "",
    })
    .returning();
  return ci;
}
