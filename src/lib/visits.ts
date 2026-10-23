import { sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignVisits } from "@/db/schema";
import type { Attribution } from "@/lib/attribution";
import { shouldCount } from "@/lib/visit-filter";

// Counts a page view by day, campaign labels and path. Only campaign-tagged visits
// and guide pages are counted (that's what the growth stats need); nothing about
// the visitor is stored. Call it from after() so it never slows a page down.

export async function recordVisit(path: string, attribution: Attribution | null, userAgent: string | null) {
  if (!shouldCount(path, attribution, userAgent)) return;
  const day = new Date().toISOString().slice(0, 10);
  await db
    .insert(campaignVisits)
    .values({
      day,
      source: attribution?.source ?? "",
      medium: attribution?.medium ?? "",
      campaign: attribution?.campaign ?? "",
      content: attribution?.content ?? "",
      path,
    })
    .onConflictDoUpdate({
      target: [
        campaignVisits.day,
        campaignVisits.source,
        campaignVisits.medium,
        campaignVisits.campaign,
        campaignVisits.content,
        campaignVisits.path,
      ],
      set: { visits: sql`${campaignVisits.visits} + 1` },
    });
}
