ALTER TABLE "organization" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill: the org's creator is the owner of its first team (onboarding
-- creates the org and that team together).
UPDATE organization o SET owner_user_id = (
  SELECT m.user_id FROM team t JOIN member m ON m.team_id = t.id
  WHERE t.org_id = o.id AND m.role = 'owner'
  ORDER BY t.created_at, m.created_at LIMIT 1
) WHERE o.owner_user_id IS NULL;
--> statement-breakpoint
-- Deleting the org was allowed for the owner of *any* team in it, and any
-- member could create a team they owned. Only the org owner deletes it now.
DROP POLICY IF EXISTS org_delete ON organization;
--> statement-breakpoint
CREATE POLICY org_delete ON organization FOR DELETE
  USING (owner_user_id = current_user_id());
--> statement-breakpoint
-- New teams: owners/admins of an existing team in the org, or the bootstrap
-- team of an org that has none yet. Members and guests can no longer mint a
-- team (and with it an owner role).
DROP POLICY IF EXISTS team_insert ON team;
--> statement-breakpoint
CREATE POLICY team_insert ON team FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM member m JOIN team t ON t.id = m.team_id
            WHERE t.org_id = team.org_id AND m.user_id = current_user_id()
              AND m.role IN ('owner','admin'))
    -- Aliased: unaliased, `team.org_id` bound to the inner row and the
    -- check meant "no team exists anywhere".
    OR NOT EXISTS (SELECT 1 FROM team t2 WHERE t2.org_id = team.org_id)
  );
