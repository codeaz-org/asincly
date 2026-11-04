-- Postgres lets PUBLIC execute new functions, and Supabase also grants them to
-- anon/authenticated, so the Data API served our SECURITY DEFINER RLS helpers
-- as /rpc endpoints that run as the owner. Policies call them as asincly_app,
-- which has explicit grants (0003, 0013, 0015, 0018, 0024); trigger functions
-- don't need EXECUTE to fire. Nobody else gets them.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
--> statement-breakpoint
-- Global (no IN SCHEMA): the PUBLIC default is built in, not per schema.
-- New helpers need their own GRANT EXECUTE ... TO asincly_app, as before.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
