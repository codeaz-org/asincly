ALTER TABLE "user" ADD COLUMN "email_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_activity" boolean DEFAULT true NOT NULL;