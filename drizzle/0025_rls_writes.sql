-- Write policies for the check-in path, which now runs as asincly_app.

-- occurrence_write was FOR ALL for any team member: a guest could delete a
-- day's occurrence and, by cascade, everyone's check-ins in it. Creating
-- today's occurrence is for contributors; changing or removing one is for
-- team admins.
DROP POLICY IF EXISTS occurrence_write ON occurrence;
--> statement-breakpoint
CREATE POLICY occurrence_insert ON occurrence FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM schedule s WHERE s.id = occurrence.schedule_id
                      AND is_team_contributor(s.team_id)));
--> statement-breakpoint
CREATE POLICY occurrence_update ON occurrence FOR UPDATE
  USING (EXISTS (SELECT 1 FROM schedule s WHERE s.id = occurrence.schedule_id
                 AND is_team_admin(s.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM schedule s WHERE s.id = occurrence.schedule_id
                      AND is_team_admin(s.team_id)));
--> statement-breakpoint
CREATE POLICY occurrence_delete ON occurrence FOR DELETE
  USING (EXISTS (SELECT 1 FROM schedule s WHERE s.id = occurrence.schedule_id
                 AND is_team_admin(s.team_id)));
--> statement-breakpoint
-- Your own check-in, only while you still contribute to its team.
DROP POLICY IF EXISTS check_in_update ON check_in;
--> statement-breakpoint
CREATE POLICY check_in_update ON check_in FOR UPDATE
  USING (user_id = current_user_id() AND is_team_contributor(check_in_team_id(id)))
  WITH CHECK (user_id = current_user_id() AND is_team_contributor(check_in_team_id(id)));
--> statement-breakpoint
DROP POLICY IF EXISTS recording_delete ON recording;
--> statement-breakpoint
CREATE POLICY recording_delete ON recording FOR DELETE
  USING (user_id = current_user_id() AND is_team_contributor(check_in_team_id(check_in_id)));
