DROP INDEX "check_in_reaction_uq";--> statement-breakpoint
ALTER TABLE "check_in_reaction" ALTER COLUMN "emoji" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_reaction_emoji_uq" ON "check_in_reaction" USING btree ("check_in_id","user_id","emoji") WHERE "check_in_reaction"."comment_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_reaction_emoji_uq" ON "check_in_reaction" USING btree ("comment_id","user_id","emoji") WHERE "check_in_reaction"."comment_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "check_in_reaction" DROP COLUMN "kind";--> statement-breakpoint
DROP TYPE "public"."reaction_kind";