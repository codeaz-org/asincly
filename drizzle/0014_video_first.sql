ALTER TYPE "public"."recording_status" ADD VALUE 'transcribing' BEFORE 'ready';--> statement-breakpoint
ALTER TYPE "public"."recording_status" ADD VALUE 'drafting' BEFORE 'ready';--> statement-breakpoint
ALTER TABLE "check_in_reaction" ALTER COLUMN "kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "check_in_reaction" ADD COLUMN "emoji" text;--> statement-breakpoint
ALTER TABLE "check_in_reaction" ADD COLUMN "comment_id" uuid;--> statement-breakpoint
ALTER TABLE "check_in" ADD COLUMN "video_skip_reason" text;--> statement-breakpoint
ALTER TABLE "check_in" ADD COLUMN "video_skip_note" text;--> statement-breakpoint
ALTER TABLE "recording" ADD COLUMN "audio_key" text;--> statement-breakpoint
ALTER TABLE "recording" ADD COLUMN "draft_cipher" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "require_video" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "check_in_reaction" ADD CONSTRAINT "check_in_reaction_comment_id_check_in_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."check_in_comment"("id") ON DELETE cascade ON UPDATE no action;