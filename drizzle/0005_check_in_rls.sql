-- RLS on check_in. Team-membership-scoped reads; a user can only own their
-- own check-in (user_id must equal current_user_id) inside a schedule
-- belonging to a team they're a member of.

ALTER TABLE check_in ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE check_in FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY check_in_select ON check_in FOR SELECT
  USING (EXISTS (SELECT 1 FROM occurrence o
                 JOIN schedule s ON s.id = o.schedule_id
                 WHERE o.id = check_in.occurrence_id
                   AND is_team_member(s.team_id)));
--> statement-breakpoint
CREATE POLICY check_in_insert ON check_in FOR INSERT
  WITH CHECK (
    user_id = current_user_id()
    AND EXISTS (SELECT 1 FROM occurrence o
                JOIN schedule s ON s.id = o.schedule_id
                WHERE o.id = check_in.occurrence_id
                  AND is_team_member(s.team_id))
  );
--> statement-breakpoint
CREATE POLICY check_in_update ON check_in FOR UPDATE
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());
--> statement-breakpoint
CREATE POLICY check_in_delete ON check_in FOR DELETE
  USING (user_id = current_user_id());
