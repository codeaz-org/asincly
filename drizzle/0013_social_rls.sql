-- RLS for the social layer (reactions, comments, blocker actions, away).
-- Everything is team-membership-scoped through the check-in's schedule.
-- Helpers run SECURITY DEFINER (same reasoning as 0003): they do fixed-shape
-- lookups and avoid re-triggering check_in / member policies recursively.

CREATE OR REPLACE FUNCTION check_in_team_id(ci uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.team_id
  FROM check_in c
  JOIN occurrence o ON o.id = c.occurrence_id
  JOIN schedule s ON s.id = o.schedule_id
  WHERE c.id = ci
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION check_in_author_id(ci uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM check_in WHERE id = ci
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION check_in_team_id(uuid), check_in_author_id(uuid) TO asincly_app;
--> statement-breakpoint

-- Integrity (not expressible in the Drizzle schema).
ALTER TABLE check_in_comment ADD CONSTRAINT check_in_comment_body_len
  CHECK (char_length(body) BETWEEN 1 AND 2000);
--> statement-breakpoint
ALTER TABLE member_away ADD CONSTRAINT member_away_range
  CHECK (ends_on >= starts_on);
--> statement-breakpoint
CREATE INDEX check_in_comment_check_in_idx ON check_in_comment (check_in_id, created_at);
--> statement-breakpoint
CREATE INDEX blocker_action_check_in_idx ON blocker_action (check_in_id);
--> statement-breakpoint
CREATE INDEX member_away_team_idx ON member_away (team_id, ends_on);
--> statement-breakpoint

-- ── check_in_reaction ──
ALTER TABLE check_in_reaction ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE check_in_reaction FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY check_in_reaction_select ON check_in_reaction FOR SELECT
  USING (is_team_member(check_in_team_id(check_in_id)));
--> statement-breakpoint
CREATE POLICY check_in_reaction_insert ON check_in_reaction FOR INSERT
  WITH CHECK (user_id = current_user_id() AND is_team_member(check_in_team_id(check_in_id)));
--> statement-breakpoint
CREATE POLICY check_in_reaction_delete ON check_in_reaction FOR DELETE
  USING (user_id = current_user_id());
--> statement-breakpoint

-- ── check_in_comment ──
ALTER TABLE check_in_comment ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE check_in_comment FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY check_in_comment_select ON check_in_comment FOR SELECT
  USING (is_team_member(check_in_team_id(check_in_id)));
--> statement-breakpoint
CREATE POLICY check_in_comment_insert ON check_in_comment FOR INSERT
  WITH CHECK (user_id = current_user_id() AND is_team_member(check_in_team_id(check_in_id)));
--> statement-breakpoint
CREATE POLICY check_in_comment_update ON check_in_comment FOR UPDATE
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());
--> statement-breakpoint
CREATE POLICY check_in_comment_delete ON check_in_comment FOR DELETE
  USING (user_id = current_user_id());
--> statement-breakpoint

-- ── blocker_action ──
-- Anyone on the team can offer help; only the check-in's author can mark
-- their own blocker resolved.
ALTER TABLE blocker_action ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE blocker_action FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY blocker_action_select ON blocker_action FOR SELECT
  USING (is_team_member(check_in_team_id(check_in_id)));
--> statement-breakpoint
CREATE POLICY blocker_action_insert ON blocker_action FOR INSERT
  WITH CHECK (
    user_id = current_user_id()
    AND is_team_member(check_in_team_id(check_in_id))
    AND (kind = 'help' OR check_in_author_id(check_in_id) = current_user_id())
  );
--> statement-breakpoint
CREATE POLICY blocker_action_delete ON blocker_action FOR DELETE
  USING (user_id = current_user_id());
--> statement-breakpoint

-- ── member_away ──
ALTER TABLE member_away ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE member_away FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY member_away_select ON member_away FOR SELECT
  USING (is_team_member(team_id));
--> statement-breakpoint
CREATE POLICY member_away_write ON member_away FOR ALL
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id() AND is_team_member(team_id));
