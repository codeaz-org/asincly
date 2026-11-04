-- 0002 left the Auth.js tables without RLS, and 0024 only revoked them from
-- asincly_app. On Supabase, the Data API (PostgREST) also reaches every table
-- in public as anon/authenticated, which Supabase grants by default, so with
-- the project's API key someone could read OAuth tokens, session tokens and
-- magic-link tokens.

-- RLS on, no policies: only the owner connection (Auth.js adapter) can touch
-- these. No FORCE, so the table owner stays exempt.
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verificationToken" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The app never goes through the Data API, so its roles get nothing, now or
-- for tables added later. They only exist on Supabase; plain Postgres skips this.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  END IF;
END $$;
