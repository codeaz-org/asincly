import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { members, teams } from "@/db/schema";
import { audit } from "@/lib/audit";
import { buildExportBundle } from "@/lib/export";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const parsed = z.string().uuid().safeParse((await params).teamId);
  if (!parsed.success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const teamId = parsed.data;
  const user = await requireUser();

  // Owner check (kept here so we can stream the JSON without a redirect chain).
  const [row] = await db
    .select({ role: members.role, slug: teams.slug, orgId: teams.orgId })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .where(and(eq(members.teamId, teamId), eq(members.userId, user.id)));
  if (!row || row.role !== "owner") {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  // Every call decrypts every transcript the team has.
  const rl = await rateLimit(`export:${user.id}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many exports — try again later." }, { status: 429 });
  }

  const bundle = await buildExportBundle(teamId);
  await audit({
    orgId: row.orgId,
    actorUserId: user.id,
    action: "team.export",
    resourceType: "team",
    resourceId: teamId,
  });
  const filename = `asincly-${row.slug}-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
