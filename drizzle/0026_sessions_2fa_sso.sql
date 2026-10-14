CREATE TABLE "user_totp" (
	"user_id" text PRIMARY KEY NOT NULL,
	"secret_cipher" text NOT NULL,
	"backup_code_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "require_2fa_for_admins" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "sso_domain" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "require_sso" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "ip_prefix" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "mfa_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_totp" ADD CONSTRAINT "user_totp_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Server-only (owner connection): second-factor secrets never reach the app role.
ALTER TABLE "user_totp" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_totp" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "user_totp" FROM asincly_app;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS organization_sso_domain_uq ON organization (lower(sso_domain)) WHERE sso_domain IS NOT NULL;
