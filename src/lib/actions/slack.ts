"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { members, organizations, slackInstalls, teams } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getEntitlements } from "@/lib/billing/entitlements";
import { decrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { joinChannel, listChannels, postMessage, revokeToken, SlackError, type SlackChannel } from "@/lib/slack/api";
import { requireUser } from "@/lib/session";
import { SlackSettingsSchema, SlackTeamSchema } from "@/lib/validation/slack";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function adminContext(teamId: string, userId: string) {
  const [row] = await db
    .select({ role: members.role, orgId: teams.orgId, orgSlug: organizations.slug, teamSlug: teams.slug })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(and(eq(members.teamId, teamId), eq(members.userId, userId)));
  if (!row || (row.role !== "owner" && row.role !== "admin")) return null;
  return row;
}

const slackMessage = (e: unknown) =>
  e instanceof SlackError && e.code === "not_in_channel"
    ? "Invite the Asincly app to that private channel first (/invite @Asincly)."
    : "Slack didn't accept that. Try again in a moment.";

export async function getSlackChannels(input: unknown): Promise<Result<{ channels: SlackChannel[] }>> {
  const parsed = SlackTeamSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const user = await requireUser();
  const ctx = await adminContext(parsed.data.teamId, user.id);
  if (!ctx) return { ok: false, error: "Admins only" };
  if (!rateLimit(`slack-channels:${user.id}`, 30, 60_000).allowed) return { ok: false, error: "Slow down" };
  const [install] = await db.select().from(slackInstalls).where(eq(slackInstalls.teamId, parsed.data.teamId));
  if (!install) return { ok: false, error: "Slack isn't connected" };
  try {
    return { ok: true, channels: await listChannels(decrypt(install.botTokenCipher)) };
  } catch (e) {
    console.error("[slack] channels failed", { code: e instanceof SlackError ? e.code : "unexpected" });
    return { ok: false, error: slackMessage(e) };
  }
}

export async function updateSlackSettings(input: unknown): Promise<Result> {
  const parsed = SlackSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid settings" };
  const { teamId, channelId, digestEnabled, remindersEnabled } = parsed.data;
  const user = await requireUser();
  const ctx = await adminContext(teamId, user.id);
  if (!ctx) return { ok: false, error: "Admins only" };
  if (!(await getEntitlements(ctx.orgId)).slack) return { ok: false, error: "Slack is part of Pro" };
  const [install] = await db.select().from(slackInstalls).where(eq(slackInstalls.teamId, teamId));
  if (!install) return { ok: false, error: "Slack isn't connected" };

  let channelName = install.channelName;
  if (channelId && channelId !== install.channelId) {
    try {
      const token = decrypt(install.botTokenCipher);
      const channel = (await listChannels(token)).find((c) => c.id === channelId);
      if (!channel) return { ok: false, error: "That channel wasn't found" };
      // Public channels: join so the bot can post. Private ones need an invite.
      if (!channel.isPrivate) await joinChannel(token, channel.id);
      channelName = channel.name;
    } catch (e) {
      return { ok: false, error: slackMessage(e) };
    }
  }

  await db
    .update(slackInstalls)
    .set({
      channelId,
      channelName: channelId ? channelName : null,
      digestEnabled,
      remindersEnabled,
      updatedAt: new Date(),
    })
    .where(eq(slackInstalls.teamId, teamId));
  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "slack.settings",
    resourceType: "team",
    resourceId: teamId,
    meta: { channelId, digestEnabled, remindersEnabled },
  });
  revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}/settings/integrations`);
  return { ok: true };
}

export async function sendSlackTest(input: unknown): Promise<Result> {
  const parsed = SlackTeamSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const user = await requireUser();
  const ctx = await adminContext(parsed.data.teamId, user.id);
  if (!ctx) return { ok: false, error: "Admins only" };
  if (!rateLimit(`slack-test:${user.id}`, 5, 60 * 60_000).allowed) return { ok: false, error: "Slow down" };
  const [install] = await db.select().from(slackInstalls).where(eq(slackInstalls.teamId, parsed.data.teamId));
  if (!install?.channelId) return { ok: false, error: "Pick a channel first" };
  try {
    const text = "Asincly is connected. Daily digests for this team will be posted here.";
    await postMessage(decrypt(install.botTokenCipher), install.channelId, {
      text,
      blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: slackMessage(e) };
  }
}

export async function disconnectSlack(input: unknown): Promise<Result> {
  const parsed = SlackTeamSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const user = await requireUser();
  const ctx = await adminContext(parsed.data.teamId, user.id);
  if (!ctx) return { ok: false, error: "Admins only" };
  const [install] = await db.select().from(slackInstalls).where(eq(slackInstalls.teamId, parsed.data.teamId));
  if (!install) return { ok: true };
  try {
    await revokeToken(decrypt(install.botTokenCipher));
  } catch (e) {
    // Already revoked on Slack's side is fine; the row goes either way.
    console.error("[slack] revoke failed", { code: e instanceof SlackError ? e.code : "unexpected" });
  }
  await db.delete(slackInstalls).where(eq(slackInstalls.teamId, parsed.data.teamId));
  await audit({
    orgId: ctx.orgId,
    actorUserId: user.id,
    action: "slack.disconnect",
    resourceType: "team",
    resourceId: parsed.data.teamId,
  });
  revalidatePath(`/${ctx.orgSlug}/${ctx.teamSlug}/settings/integrations`);
  return { ok: true };
}
