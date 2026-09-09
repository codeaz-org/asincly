-- Membership helpers re-query the `member` table, which retriggers its own
-- RLS policy → infinite recursion. Run the helpers as their owner
-- (asincly superuser, which bypasses RLS) via SECURITY DEFINER.
-- Bodies only do fixed-shape lookups against member/team, so this is safe.

CREATE OR REPLACE FUNCTION is_team_member(t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM member WHERE team_id = t AND user_id = current_user_id())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION is_team_admin(t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM member
    WHERE team_id = t AND user_id = current_user_id() AND role IN ('owner','admin')
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION is_org_member(o uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM member m JOIN team t ON t.id = m.team_id
    WHERE t.org_id = o AND m.user_id = current_user_id()
  )
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION current_user_id(), is_team_member(uuid), is_team_admin(uuid), is_org_member(uuid) TO asincly_app;
