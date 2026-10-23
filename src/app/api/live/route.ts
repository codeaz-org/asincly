import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// A fingerprint of what a team page shows that other people change: your
// notifications, and the last week's check-ins, replies and reactions on the
// team. <LiveRefresh> polls it and refreshes the page when it moves.
// Read as the viewer, so RLS limits it to their own rows and teams.
// ponytail: polling, ~6 tiny queries a minute per open tab; move to
// Postgres LISTEN + SSE if that ever costs more than it's worth.
export async function GET(req: Request) {
  const team = z.string().uuid().safeParse(new URL(req.url).searchParams.get("team"));
  if (!team.success) return NextResponse.json({ v: null }, { status: 400 });
  const user = await requireUser();

  const [row] = await withUser(user.id, (tx) =>
    tx.execute<{ v: string }>(sql`
      with recent as (
        select ci.id, ci.updated_at, ci.status
        from check_in ci
        join occurrence o on o.id = ci.occurrence_id
        join schedule s on s.id = o.schedule_id
        where s.team_id = ${team.data} and ci.local_date >= current_date - 7
      )
      select md5(concat_ws('|',
        (select string_agg(n.id::text || n.created_at::text || coalesce(n.read_at::text, ''), ',' order by n.created_at desc)
           from (select * from notification where user_id = ${user.id} order by created_at desc limit 20) n),
        (select count(*) || max(updated_at)::text from recent where status = 'submitted'),
        (select count(*) || max(c.created_at)::text || count(c.deleted_at) from check_in_comment c where c.check_in_id in (select id from recent)),
        (select count(*) || max(r.created_at)::text from check_in_reaction r where r.check_in_id in (select id from recent))
      )) as v`),
  );
  return NextResponse.json({ v: row?.v ?? null }, { headers: { "cache-control": "no-store" } });
}
