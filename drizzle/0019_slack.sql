CREATE TABLE "slack_install" (
	"team_id" uuid PRIMARY KEY NOT NULL,
	"slack_team_id" text NOT NULL,
	"slack_team_name" text NOT NULL,
	"bot_user_id" text NOT NULL,
	"bot_token_cipher" text NOT NULL,
	"channel_id" text,
	"channel_name" text,
	"digest_enabled" boolean DEFAULT true NOT NULL,
	"reminders_enabled" boolean DEFAULT false NOT NULL,
	"installed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_install" ADD CONSTRAINT "slack_install_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_install" ADD CONSTRAINT "slack_install_installed_by_user_id_user_id_fk" FOREIGN KEY ("installed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;