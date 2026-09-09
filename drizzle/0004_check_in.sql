CREATE TYPE "public"."check_in_status" AS ENUM('draft', 'submitted');--> statement-breakpoint
CREATE TABLE "check_in" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "check_in_status" DEFAULT 'draft' NOT NULL,
	"yesterday" text DEFAULT '' NOT NULL,
	"today" text DEFAULT '' NOT NULL,
	"blockers" text DEFAULT '' NOT NULL,
	"local_date" date NOT NULL,
	"submitted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_occurrence_id_occurrence_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."occurrence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_occurrence_user_uq" ON "check_in" USING btree ("occurrence_id","user_id");