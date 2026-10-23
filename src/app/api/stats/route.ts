import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bearerMatches } from "@/lib/cron-auth";

// Aggregate growth numbers for the maintainers' launch dashboard: organizations
// created and active, per first-touch campaign (lib/attribution.ts). Counts
// only: no names, emails, org names or content ever leave this route.
//
// Auth: Authorization: Bearer $STATS_TOKEN. Unset = route disabled (404).

export const dynamic = "force-dynamic";

type SourceRow = { source: string | null; medium: string | null; campaign: string | null; orgs: number; active_orgs: number };

export async function GET(req: Request) {
  if (!process.env.STATS_TOKEN) return new NextResponse(null, { status: 404 });
  if (!bearerMatches(req, process.env.STATS_TOKEN)) return new NextResponse(null, { status: 401 });

  // "Active" = at least one submitted check-in in the last 7 days.
  const [totals] = await db.execute<{ orgs: number; orgs_7d: number; orgs_28d: number; active_users_7d: number; check_ins_7d: number }>(sql`
    select
      (select count(*)::int from organization) as orgs,
      (select count(*)::int from organization where created_at > now() - interval '7 days') as orgs_7d,
      (select count(*)::int from organization where created_at > now() - interval '28 days') as orgs_28d,
      (select count(distinct user_id)::int from check_in where status = 'submitted' and submitted_at > now() - interval '7 days') as active_users_7d,
      (select count(*)::int from check_in where status = 'submitted' and submitted_at > now() - interval '7 days') as check_ins_7d
  `);

  const bySource = await db.execute<SourceRow>(sql`
    with active as (
      select distinct t.org_id
      from check_in c
      join occurrence o on o.id = c.occurrence_id
      join schedule s on s.id = o.schedule_id
      join team t on t.id = s.team_id
      where c.status = 'submitted' and c.submitted_at > now() - interval '7 days'
    )
    select
      g.acquisition->>'source' as source,
      g.acquisition->>'medium' as medium,
      g.acquisition->>'campaign' as campaign,
      count(*)::int as orgs,
      count(a.org_id)::int as active_orgs
    from organization g
    left join active a on a.org_id = g.id
    group by 1, 2, 3
    order by orgs desc
  `);

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), totals, bySource: [...bySource] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
