import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { members, teams } from "@/db/schema";
import { getEntitlements } from "@/lib/billing/entitlements";
import { rateLimit } from "@/lib/rate-limit";
import { authorizeUrl, slackConfigured } from "@/lib/slack/api";
import { createState } from "@/lib/slack/state";

export const dynamic = "force-dynamic";

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Owner/admin starts "Add to Slack" for one team.
export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.redirect(`${appUrl()}/sign-in`);
  if (!slackConfigured() || !process.env.AUTH_SECRET) {
    return NextResponse.json({ ok: false, error: "Slack isn't configured on this server" }, { status: 404 });
  }
  if (!rateLimit(`slack-install:${userId}`, 10, 60 * 60 * 1000).allowed) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  }

  const teamId = z.string().uuid().safeParse(new URL(req.url).searchParams.get("teamId"));
  if (!teamId.success) return NextResponse.json({ ok: false, error: "invalid team" }, { status: 400 });

  const [row] = await db
    .select({ role: members.role, orgId: teams.orgId })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .where(and(eq(members.teamId, teamId.data), eq(members.userId, userId)));
  if (!row || (row.role !== "owner" && row.role !== "admin")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!(await getEntitlements(row.orgId)).slack) {
    return NextResponse.json({ ok: false, error: "Slack is part of Pro" }, { status: 402 });
  }

  const state = createState(teamId.data, userId, process.env.AUTH_SECRET);
  return NextResponse.redirect(authorizeUrl(state, `${appUrl()}/api/slack/callback`));
}
