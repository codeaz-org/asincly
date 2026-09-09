CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "occurrence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"schedule_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rrule" text NOT NULL,
	"window_open_local" time NOT NULL,
	"window_close_local" time NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence" ADD CONSTRAINT "occurrence_schedule_id_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_team_user_uq" ON "member" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "occurrence_schedule_date_uq" ON "occurrence" USING btree ("schedule_id","schedule_date");--> statement-breakpoint
CREATE UNIQUE INDEX "team_org_slug_uq" ON "team" USING btree ("org_id","slug");