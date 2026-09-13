CREATE TYPE "public"."billing_plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."billing_status" AS ENUM('trialing', 'active', 'past_due', 'canceled');--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE 'guest';--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"org_id" uuid NOT NULL,
	"period" text NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_org_id_period_pk" PRIMARY KEY("org_id","period")
);
--> statement-breakpoint
CREATE TABLE "org_billing" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"plan" "billing_plan" DEFAULT 'free' NOT NULL,
	"status" "billing_status" DEFAULT 'active' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"interval" text,
	"seats" integer DEFAULT 0 NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"past_due_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_billing_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "org_billing_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_billing" ADD CONSTRAINT "org_billing_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;