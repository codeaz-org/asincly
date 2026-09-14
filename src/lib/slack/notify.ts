import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { checkIns, slackInstalls, teams, users } from "@/db/schema";
import { getEntitlements } from "@/lib/billing/entitlements";
import { decrypt } from "@/lib/crypto";
import { displayName } from "@/lib/display";
import { lookupUserByEmail, postMessage, revokeToken, slackConfigured, SlackError } from "@/lib/slack/api";
import { digestMessage, reminderMessage } from "@/lib/slack/format";

// Slack side effects fired from the cron tick. Every function swallows its
// own errors: Slack being down must never stop in-app reminders or digests.

const DEAD_TOKEN = new Set(["token_revoked", "account_inactive", "invalid_auth", "not_authed", "team_access_not_granted"]);

type Install = typeof slackInstalls.$inferSelect;

async function activeInstall(teamId: string, orgId: string): Promise<Install | null> {
  if (!slackConfigured()) return null;
  const [install] = await db.select().from(slackInstalls).where(eq(slackInstalls.teamId, teamId));
  if (!install) return null;
  if (!(await getEntitlements(orgId)).slack) return null;
  return install;
}

async function handleError(install: Install, what: string, e: unknown) {
  const code = e instanceof SlackError ? e.code : "unexpected";
  console.error(`[slack] ${what} failed`, { teamId: install.teamId, code });
  if (DEAD_TOKEN.has(code)) {
    // The workspace removed the app; drop the connection so settings show it.
    await db.delete(slackInstalls).where(eq(slackInstalls.teamId, install.teamId));
  }
}

export async function postDigestToSlack(input: {
  teamId: string;
  orgId: string;
  occurrenceId: string;
  teamName: string;
  dateLabel: string;
  url: string;
  expected: number;
}): Promise<boolean> {
  const install = await activeInstall(input.teamId, input.orgId);
  if (!install?.digestEnabled || !install.channelId) return false;
  try {
    const rows = await db
      .select({ name: users.name, email: users.email, today: checkIns.today, blockers: checkIns.blockers })
      .from(checkIns)
      .innerJoin(users, eq(users.id, checkIns.userId))
      .where(and(eq(checkIns.occurrenceId, input.occurrenceId), eq(checkIns.status, "submitted")));
    const message = digestMessage({
      teamName: input.teamName,
      dateLabel: input.dateLabel,
      url: input.url,
      expected: input.expected,
      entries: rows.map((r) => ({ name: displayName(r.name, r.email), today: r.today, blockers: r.blockers })),
    });
    await postMessage(decrypt(install.botTokenCipher), install.channelId, message);
    return true;
  } catch (e) {
    await handleError(install, "digest", e);
    return false;
  }
}

export async function sendSlackReminder(input: {
  teamId: string;
  orgId: string;
  email: string;
  teamName: string;
  closesAt: string;
  url: string;
}): Promise<boolean> {
  const install = await activeInstall(input.teamId, input.orgId);
  if (!install?.remindersEnabled) return false;
  try {
    const token = decrypt(install.botTokenCipher);
    const slackUser = await lookupUserByEmail(token, input.email);
    if (!slackUser) return false;
    await postMessage(token, slackUser, reminderMessage(input));
    return true;
  } catch (e) {
    await handleError(install, "reminder", e);
    return false;
  }
}

// Before a team or organization is deleted: revoke its bot tokens so the
// workspace connection doesn't outlive the data. Best effort.
export async function revokeSlackFor(where: { teamId: string } | { orgId: string }): Promise<void> {
  const rows =
    "teamId" in where
      ? await db.select().from(slackInstalls).where(eq(slackInstalls.teamId, where.teamId))
      : await db
          .select({ botTokenCipher: slackInstalls.botTokenCipher, teamId: slackInstalls.teamId })
          .from(slackInstalls)
          .innerJoin(teams, eq(teams.id, slackInstalls.teamId))
          .where(eq(teams.orgId, where.orgId));
  for (const r of rows) {
    try {
      await revokeToken(decrypt(r.botTokenCipher));
    } catch (e) {
      console.error("[slack] revoke on delete failed", { teamId: r.teamId, code: e instanceof SlackError ? e.code : "unexpected" });
    }
  }
}
