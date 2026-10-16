CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"invited_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_totp" ADD COLUMN "last_step" integer;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_team_email_uq" ON "invitation" USING btree ("team_id","email");--> statement-breakpoint
-- Server-only (owner connection), like user_totp: invites are read by email
-- before the invitee belongs to anything.
ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "invitation" FROM asincly_app;
--> statement-breakpoint
-- One reminder and one digest per person per occurrence, even when two cron
-- runs overlap. Earlier duplicates go first so the index can be built.
DELETE FROM notification n USING notification d
  WHERE n.type IN ('window_open', 'digest_ready') AND d.type = n.type AND d.user_id = n.user_id
    AND d.data->>'occurrenceId' = n.data->>'occurrenceId' AND d.created_at < n.created_at;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS notification_once_per_occurrence_uq
  ON notification (user_id, type, (data->>'occurrenceId'))
  WHERE type IN ('window_open', 'digest_ready');
--> statement-breakpoint
-- Policies no wider than what the app does. These writes all go through the
-- owner connection today; if one moves to the app role it can't do more.
DROP POLICY org_update ON organization;
--> statement-breakpoint
CREATE POLICY org_update ON organization FOR UPDATE
  USING (owner_user_id = current_user_id())
  WITH CHECK (owner_user_id = current_user_id());
--> statement-breakpoint
DROP POLICY team_update ON team;
--> statement-breakpoint
CREATE POLICY team_update ON team FOR UPDATE
  USING (is_team_admin(id))
  WITH CHECK (is_team_admin(id));
--> statement-breakpoint
DROP POLICY member_update ON member;
--> statement-breakpoint
CREATE POLICY member_update ON member FOR UPDATE
  USING (is_team_admin(team_id))
  WITH CHECK (is_team_admin(team_id) AND role <> 'owner');
--> statement-breakpoint
DROP POLICY notification_insert ON notification;
--> statement-breakpoint
CREATE POLICY notification_insert ON notification FOR INSERT
  WITH CHECK (user_id = current_user_id() AND is_team_member(team_id));
--> statement-breakpoint
-- A team never changes organization and a membership never changes team or
-- person; a policy can't compare old and new rows, a trigger can.
CREATE OR REPLACE FUNCTION keep_row_owner() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'team' AND NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'a team cannot move to another organization';
  END IF;
  IF TG_TABLE_NAME = 'member' AND (NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'a membership cannot change team or person';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER team_keep_org BEFORE UPDATE ON team FOR EACH ROW EXECUTE FUNCTION keep_row_owner();
--> statement-breakpoint
CREATE TRIGGER member_keep_owner BEFORE UPDATE ON member FOR EACH ROW EXECUTE FUNCTION keep_row_owner();
