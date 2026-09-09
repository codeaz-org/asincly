import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { members, teams } from "@/db/schema";
import { buildExportBundle } from "@/lib/actions/team-admin";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const user = await requireUser();

  // Owner check (mirrors requireOwner in the action file, kept here so we
  // can stream the JSON without a redirect chain).
  const [row] = await db
    .select({ role: members.role, slug: teams.slug })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .where(and(eq(members.teamId, teamId), eq(members.userId, user.id)));
  if (!row || row.role !== "owner") {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  const bundle = await buildExportBundle(teamId);
  const filename = `asincly-${row.slug}-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
