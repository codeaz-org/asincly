ALTER TABLE "organization" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "terms_accepted_by" text;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_terms_accepted_by_user_id_fk" FOREIGN KEY ("terms_accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;