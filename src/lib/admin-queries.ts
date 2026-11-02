import { sql } from "drizzle-orm";
import { db } from "@/db";

// Cross-tenant numbers for /admin. The owner connection on purpose: RLS would
// limit this to the operator's own teams. Metadata only: who, when, how many.
// No check-in text, transcripts, summaries or recordings are read here.

export type AdminTotals = {
  users: number;
  users_7d: number;
  seen_7d: number;
  orgs: number;
  orgs_7d: number;
  active_orgs_7d: number;
  check_ins_7d: number;
  checkers_7d: number;
  recordings_7d: number;
  comments_7d: number;
};

export type AdminDay = { day: string; signups: number; check_ins: number; recordings: number; comments: number };

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  created_at: Date;
  last_seen: Date | null;
  orgs: string | null;
  check_ins: number;
  last_check_in: Date | null;
  has_2fa: boolean;
};

export type AdminOrg = {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
  owner_email: string | null;
  source: string | null;
  people: number;
  teams: number;
  plan: "free" | "pro" | null;
  status: "trialing" | "active" | "past_due" | "canceled" | null;
  trial_ends_at: Date | null;
  past_due_since: Date | null;
  current_period_end: Date | null;
  paying: boolean;
  check_ins_7d: number;
  last_check_in: Date | null;
};

const LIMIT = 200;

// Submitted check-ins with the org they belong to.
const orgCheckIns = sql`
  select t.org_id, c.submitted_at, c.user_id
  from check_in c
  join occurrence oc on oc.id = c.occurrence_id
  join schedule s on s.id = oc.schedule_id
  join team t on t.id = s.team_id
  where c.status = 'submitted'`;

export async function adminTotals(): Promise<AdminTotals> {
  const [row] = await db.execute<AdminTotals>(sql`
    with ci as (${orgCheckIns})
    select
      (select count(*)::int from "user") as users,
      (select count(*)::int from "user" where created_at > now() - interval '7 days') as users_7d,
      (select count(distinct "userId")::int from session where last_seen_at > now() - interval '7 days') as seen_7d,
      (select count(*)::int from organization) as orgs,
      (select count(*)::int from organization where created_at > now() - interval '7 days') as orgs_7d,
      (select count(distinct org_id)::int from ci where submitted_at > now() - interval '7 days') as active_orgs_7d,
      (select count(*)::int from ci where submitted_at > now() - interval '7 days') as check_ins_7d,
      (select count(distinct user_id)::int from ci where submitted_at > now() - interval '7 days') as checkers_7d,
      (select count(*)::int from recording where created_at > now() - interval '7 days') as recordings_7d,
      (select count(*)::int from check_in_comment where created_at > now() - interval '7 days') as comments_7d
  `);
  return row;
}

// The last 14 UTC days, newest first.
export async function adminDaily(): Promise<AdminDay[]> {
  return db.execute<AdminDay>(sql`
    with days as (select generate_series(current_date - 13, current_date, interval '1 day')::date as day)
    select
      to_char(d.day, 'YYYY-MM-DD') as day,
      (select count(*)::int from "user" u where u.created_at::date = d.day) as signups,
      (select count(*)::int from check_in c where c.status = 'submitted' and c.submitted_at::date = d.day) as check_ins,
      (select count(*)::int from recording r where r.created_at::date = d.day) as recordings,
      (select count(*)::int from check_in_comment m where m.created_at::date = d.day) as comments
    from days d
    order by d.day desc
  `);
}

// ponytail: newest 200, no paging or search; add both when that stops fitting on a page.
export async function adminUsers(): Promise<AdminUser[]> {
  return db.execute<AdminUser>(sql`
    select
      u.id, u.email, u.name, u.created_at,
      (select max(s.last_seen_at) from session s where s."userId" = u.id) as last_seen,
      (select string_agg(distinct o.slug, ', ')
         from member m join team t on t.id = m.team_id join organization o on o.id = t.org_id
        where m.user_id = u.id) as orgs,
      (select count(*)::int from check_in c where c.user_id = u.id and c.status = 'submitted') as check_ins,
      (select max(c.submitted_at) from check_in c where c.user_id = u.id and c.status = 'submitted') as last_check_in,
      exists (select 1 from user_totp x where x.user_id = u.id and x.confirmed_at is not null) as has_2fa
    from "user" u
    order by u.created_at desc
    limit ${LIMIT}
  `);
}

export async function adminOrgs(): Promise<AdminOrg[]> {
  return db.execute<AdminOrg>(sql`
    with ci as (${orgCheckIns})
    select
      o.id, o.name, o.slug, o.created_at,
      ow.email as owner_email,
      o.acquisition->>'source' as source,
      (select count(distinct m.user_id)::int from member m join team t on t.id = m.team_id where t.org_id = o.id) as people,
      (select count(*)::int from team t where t.org_id = o.id) as teams,
      b.plan, b.status, b.trial_ends_at, b.past_due_since, b.current_period_end,
      (b.stripe_subscription_id is not null) as paying,
      (select count(*)::int from ci where ci.org_id = o.id and ci.submitted_at > now() - interval '7 days') as check_ins_7d,
      (select max(ci.submitted_at) from ci where ci.org_id = o.id) as last_check_in
    from organization o
    left join "user" ow on ow.id = o.owner_user_id
    left join org_billing b on b.org_id = o.id
    order by o.created_at desc
    limit ${LIMIT}
  `);
}
