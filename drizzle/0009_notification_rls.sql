-- RLS on notification. Each user reads/updates only their own rows.

ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY notification_select ON notification FOR SELECT
  USING (user_id = current_user_id());
--> statement-breakpoint
-- Inserts are performed by trusted server actions / cron jobs running as
-- the admin role (which bypasses RLS by owner). But when running as
-- asincly_app we still need a permissive INSERT — allow inserts for any
-- user in a team the caller is a member of, so peer-triggered events
-- (mentions) can create rows for the target user.
CREATE POLICY notification_insert ON notification FOR INSERT
  WITH CHECK (
    user_id = current_user_id()
    OR is_team_member(team_id)
  );
--> statement-breakpoint
CREATE POLICY notification_update ON notification FOR UPDATE
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());
--> statement-breakpoint
CREATE POLICY notification_delete ON notification FOR DELETE
  USING (user_id = current_user_id());
