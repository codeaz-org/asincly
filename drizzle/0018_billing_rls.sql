-- Billing tables: readable by anyone in the organization, written only by
-- trusted server code (onboarding, Stripe webhook, AI pipeline) through the
-- owner connection. Guests: read and discuss, never contribute check-ins.

ALTER TABLE org_billing ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE org_billing FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY org_billing_select ON org_billing FOR SELECT
  USING (is_org_member(org_id));
--> statement-breakpoint

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_usage FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_usage_select ON ai_usage FOR SELECT
  USING (is_org_member(org_id));
--> statement-breakpoint

-- Webhook bookkeeping: no app-role access at all.
ALTER TABLE stripe_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stripe_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- A contributor is a team member who isn't a guest. Compared as text so this
-- migration can run in the same transaction that added the 'guest' value.
CREATE OR REPLACE FUNCTION is_team_contributor(t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM member
    WHERE team_id = t AND user_id = current_user_id() AND role::text <> 'guest'
  )
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION is_team_contributor(uuid) TO asincly_app;
--> statement-breakpoint

DROP POLICY IF EXISTS check_in_insert ON check_in;
--> statement-breakpoint
CREATE POLICY check_in_insert ON check_in FOR INSERT
  WITH CHECK (
    user_id = current_user_id()
    AND EXISTS (SELECT 1 FROM occurrence o
                JOIN schedule s ON s.id = o.schedule_id
                WHERE o.id = check_in.occurrence_id
                  AND is_team_contributor(s.team_id))
  );
--> statement-breakpoint
DROP POLICY IF EXISTS recording_insert ON recording;
--> statement-breakpoint
CREATE POLICY recording_insert ON recording FOR INSERT
  WITH CHECK (
    user_id = current_user_id()
    AND is_team_contributor(check_in_team_id(check_in_id))
  );
--> statement-breakpoint
DROP POLICY IF EXISTS member_away_write ON member_away;
--> statement-breakpoint
CREATE POLICY member_away_write ON member_away FOR ALL
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id() AND is_team_contributor(team_id));
