-- Slack connections: team owners/admins can see which workspace and channel
-- are connected. The (encrypted) bot token is only ever written by trusted
-- server code through the owner connection.

ALTER TABLE slack_install ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE slack_install FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY slack_install_select ON slack_install FOR SELECT
  USING (is_team_admin(team_id));
