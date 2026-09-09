-- App role + Row-Level Security.
-- Runtime uses `asincly_app` (non-superuser). Migrations still run as the
-- superuser in DATABASE_URL. Every request must open a tx and
-- SET LOCAL app.current_user_id = <session user id>; policies read it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asincly_app') THEN
    -- ponytail: dev password baked in. In prod, ALTER ROLE asincly_app
    -- WITH PASSWORD '...' via an out-of-band secret before migrations.
    CREATE ROLE asincly_app WITH LOGIN PASSWORD 'asincly_app';
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO asincly_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO asincly_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO asincly_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO asincly_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO asincly_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION current_user_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION is_team_member(t uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM member WHERE team_id = t AND user_id = current_user_id())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION is_team_admin(t uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM member
    WHERE team_id = t AND user_id = current_user_id() AND role IN ('owner','admin')
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION is_org_member(o uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM member m JOIN team t ON t.id = m.team_id
    WHERE t.org_id = o AND m.user_id = current_user_id()
  )
$$;
--> statement-breakpoint

-- Auth.js tables (user/account/session/verificationToken) intentionally have
-- no RLS: magic-link + adapter flows need pre-auth access to them.
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organization FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE team ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE team FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE member ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE member FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE schedule ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE schedule FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE occurrence ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE occurrence FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY org_select ON organization FOR SELECT
  USING (is_org_member(id));
--> statement-breakpoint
CREATE POLICY org_insert ON organization FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY org_update ON organization FOR UPDATE
  USING (EXISTS (SELECT 1 FROM member m JOIN team t ON t.id = m.team_id
                 WHERE t.org_id = organization.id AND m.user_id = current_user_id()
                   AND m.role IN ('owner','admin')))
  WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY org_delete ON organization FOR DELETE
  USING (EXISTS (SELECT 1 FROM member m JOIN team t ON t.id = m.team_id
                 WHERE t.org_id = organization.id AND m.user_id = current_user_id()
                   AND m.role = 'owner'));
--> statement-breakpoint

CREATE POLICY team_select ON team FOR SELECT
  USING (is_org_member(org_id));
--> statement-breakpoint
-- Insert allowed when either you're already an org member, OR the org has no
-- teams yet (bootstrap — first team by whoever just created the org).
CREATE POLICY team_insert ON team FOR INSERT
  WITH CHECK (
    is_org_member(org_id)
    OR NOT EXISTS (SELECT 1 FROM team WHERE org_id = team.org_id)
  );
--> statement-breakpoint
CREATE POLICY team_update ON team FOR UPDATE
  USING (is_team_admin(id))
  WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY team_delete ON team FOR DELETE
  USING (EXISTS (SELECT 1 FROM member m WHERE m.team_id = team.id
                 AND m.user_id = current_user_id() AND m.role = 'owner'));
--> statement-breakpoint

CREATE POLICY member_select ON member FOR SELECT
  USING (is_team_member(team_id));
--> statement-breakpoint
-- Insert yourself into an empty team (bootstrap), or admins add anyone.
CREATE POLICY member_insert ON member FOR INSERT
  WITH CHECK (
    (user_id = current_user_id()
      AND NOT EXISTS (SELECT 1 FROM member WHERE team_id = member.team_id))
    OR is_team_admin(team_id)
  );
--> statement-breakpoint
CREATE POLICY member_update ON member FOR UPDATE
  USING (is_team_admin(team_id))
  WITH CHECK (is_team_admin(team_id));
--> statement-breakpoint
CREATE POLICY member_delete ON member FOR DELETE
  USING (is_team_admin(team_id) OR user_id = current_user_id());
--> statement-breakpoint

CREATE POLICY schedule_select ON schedule FOR SELECT
  USING (is_team_member(team_id));
--> statement-breakpoint
CREATE POLICY schedule_write ON schedule FOR ALL
  USING (is_team_admin(team_id))
  WITH CHECK (is_team_admin(team_id));
--> statement-breakpoint
CREATE POLICY occurrence_select ON occurrence FOR SELECT
  USING (EXISTS (SELECT 1 FROM schedule s WHERE s.id = occurrence.schedule_id
                 AND is_team_member(s.team_id)));
--> statement-breakpoint
CREATE POLICY occurrence_write ON occurrence FOR ALL
  USING (EXISTS (SELECT 1 FROM schedule s WHERE s.id = occurrence.schedule_id
                 AND is_team_member(s.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM schedule s WHERE s.id = occurrence.schedule_id
                      AND is_team_member(s.team_id)));
--> statement-breakpoint

CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (is_org_member(org_id));
--> statement-breakpoint
CREATE POLICY audit_log_insert ON audit_log FOR INSERT
  WITH CHECK (is_org_member(org_id) OR actor_user_id = current_user_id());
