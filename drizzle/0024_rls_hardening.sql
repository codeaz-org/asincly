-- RLS for the request path (the app now reads as asincly_app via withUser).

-- Who may see a user row: yourself; anyone you share an organization with;
-- and anyone who wrote, commented or reacted in one of your teams, so a
-- removed teammate's history keeps its author. SECURITY DEFINER for the same
-- reason as the membership helpers (policies on member would recurse).
CREATE OR REPLACE FUNCTION user_visible(uid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT uid = current_user_id()
    OR EXISTS (
      SELECT 1 FROM member m1
      JOIN team t1 ON t1.id = m1.team_id
      JOIN team t2 ON t2.org_id = t1.org_id
      JOIN member m2 ON m2.team_id = t2.id
      WHERE m1.user_id = uid AND m2.user_id = current_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM check_in c
      JOIN occurrence o ON o.id = c.occurrence_id
      JOIN schedule s ON s.id = o.schedule_id
      WHERE c.user_id = uid AND is_team_member(s.team_id)
    )
    OR EXISTS (
      SELECT 1 FROM check_in_comment cc
      WHERE cc.user_id = uid AND is_team_member(check_in_team_id(cc.check_in_id))
    )
    OR EXISTS (
      SELECT 1 FROM check_in_reaction r
      WHERE r.user_id = uid AND is_team_member(check_in_team_id(r.check_in_id))
    )
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION user_visible(text) TO asincly_app;
--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_select ON "user" FOR SELECT USING (user_visible(id));
--> statement-breakpoint
CREATE POLICY user_update_self ON "user" FOR UPDATE
  USING (id = current_user_id()) WITH CHECK (id = current_user_id());
--> statement-breakpoint
-- Auth.js tables and the rate limiter are server-only (owner connection).
-- The app role never needs session tokens, OAuth tokens or magic-link tokens.
REVOKE ALL ON "session", "account", "verificationToken", "rate_limit" FROM asincly_app;
--> statement-breakpoint
-- audit_log: "OR actor_user_id = current_user_id()" let any signed-in user
-- write a row into any org's log. Inserts now need membership and the
-- caller as actor; reads need an owner/admin role (meta holds invitee
-- emails and other people's actions).
DROP POLICY IF EXISTS audit_log_insert ON audit_log;
--> statement-breakpoint
CREATE POLICY audit_log_insert ON audit_log FOR INSERT
  WITH CHECK (is_org_member(org_id) AND actor_user_id = current_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS audit_log_select ON audit_log;
--> statement-breakpoint
CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM member m JOIN team t ON t.id = m.team_id
    WHERE t.org_id = audit_log.org_id AND m.user_id = current_user_id()
      AND m.role IN ('owner','admin')
  ));
