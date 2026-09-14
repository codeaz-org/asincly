import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { members, organizations, slackInstalls, teams } from "@/db/schema";
import { audit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { exchangeCode, SlackError, slackConfigured } from "@/lib/slack/api";
import { readState } from "@/lib/slack/state";

export const dynamic = "force-dynamic";

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Slack redirects here after the workspace admin approves the app.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.AUTH_SECRET;
  if (!slackConfigured() || !secret) return NextResponse.json({ ok: false }, { status: 404 });

  const state = readState(url.searchParams.get("state") ?? "", secret);
  const session = await auth();
  if (!state || session?.user?.id !== state.userId) {
    return NextResponse.json({ ok: false, error: "This Slack link expired. Start again from settings." }, { status: 400 });
  }

  const [ctx] = await db
    .select({ role: members.role, orgId: teams.orgId, orgSlug: organizations.slug, teamSlug: teams.slug })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(and(eq(members.teamId, state.teamId), eq(members.userId, state.userId)));
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "admin")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const back = `${appUrl()}/${ctx.orgSlug}/${ctx.teamSlug}/settings/integrations`;

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${back}?slack=denied`);

  try {
    const res = await exchangeCode(code, `${appUrl()}/api/slack/callback`);
    const values = {
      slackTeamId: res.team.id,
      slackTeamName: res.team.name,
      botUserId: res.bot_user_id,
      botTokenCipher: encrypt(res.access_token),
      installedByUserId: state.userId,
      updatedAt: new Date(),
    };
    await db
      .insert(slackInstalls)
      .values({ teamId: state.teamId, ...values })
      .onConflictDoUpdate({ target: slackInstalls.teamId, set: { ...values, channelId: null, channelName: null } });
    await audit({
      orgId: ctx.orgId,
      actorUserId: state.userId,
      action: "slack.connect",
      resourceType: "team",
      resourceId: state.teamId,
      meta: { workspace: res.team.name },
    });
    return NextResponse.redirect(`${back}?slack=connected`);
  } catch (e) {
    console.error("[slack] oauth failed", { code: e instanceof SlackError ? e.code : "unexpected" });
    return NextResponse.redirect(`${back}?slack=error`);
  }
}
