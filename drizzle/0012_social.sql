CREATE TYPE "public"."blocker_action_kind" AS ENUM('help', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."reaction_kind" AS ENUM('seen', 'nice', 'thanks', 'help');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'commented';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'help_offered';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'blocker_resolved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'nudged';--> statement-breakpoint
CREATE TABLE "blocker_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_in_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" "blocker_action_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_in_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_in_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "check_in_reaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_in_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" "reaction_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_away" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocker_action" ADD CONSTRAINT "blocker_action_check_in_id_check_in_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "public"."check_in"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocker_action" ADD CONSTRAINT "blocker_action_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_comment" ADD CONSTRAINT "check_in_comment_check_in_id_check_in_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "public"."check_in"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_comment" ADD CONSTRAINT "check_in_comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_reaction" ADD CONSTRAINT "check_in_reaction_check_in_id_check_in_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "public"."check_in"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_reaction" ADD CONSTRAINT "check_in_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_away" ADD CONSTRAINT "member_away_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_away" ADD CONSTRAINT "member_away_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blocker_action_uq" ON "blocker_action" USING btree ("check_in_id","item_key","user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_reaction_uq" ON "check_in_reaction" USING btree ("check_in_id","user_id","kind");