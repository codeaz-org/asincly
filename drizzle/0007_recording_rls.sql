-- RLS on recording. Read scoped to team members (via the parent check-in
-- → occurrence → schedule → team chain). Write only by the recording owner.

ALTER TABLE recording ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE recording FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY recording_select ON recording FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM check_in ci
    JOIN occurrence o ON o.id = ci.occurrence_id
    JOIN schedule s ON s.id = o.schedule_id
    WHERE ci.id = recording.check_in_id
      AND is_team_member(s.team_id)
  ));
--> statement-breakpoint
CREATE POLICY recording_insert ON recording FOR INSERT
  WITH CHECK (
    user_id = current_user_id()
    AND EXISTS (
      SELECT 1 FROM check_in ci
      JOIN occurrence o ON o.id = ci.occurrence_id
      JOIN schedule s ON s.id = o.schedule_id
      WHERE ci.id = recording.check_in_id
        AND is_team_member(s.team_id)
    )
  );
--> statement-breakpoint
CREATE POLICY recording_update ON recording FOR UPDATE
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());
--> statement-breakpoint
CREATE POLICY recording_delete ON recording FOR DELETE
  USING (user_id = current_user_id());
