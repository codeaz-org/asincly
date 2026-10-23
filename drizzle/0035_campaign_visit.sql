CREATE TABLE "campaign_visit" (
	"day" date NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"medium" text DEFAULT '' NOT NULL,
	"campaign" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"path" text NOT NULL,
	"visits" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "campaign_visit_day_source_medium_campaign_content_path_pk" PRIMARY KEY("day","source","medium","campaign","content","path")
);
--> statement-breakpoint
-- Server-only: the owner connection reads and writes it; the app role gets
-- nothing (RLS on, no policies).
ALTER TABLE "campaign_visit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "campaign_visit" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "campaign_visit" FROM asincly_app;
