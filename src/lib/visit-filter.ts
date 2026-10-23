import type { Attribution } from "@/lib/attribution";

// Which page views lib/visits.ts counts: campaign-tagged visits and guide pages,
// from browsers only.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor|curl|wget|python|node-fetch/i;

export function shouldCount(path: string, attribution: Attribution | null, userAgent: string | null): boolean {
  if (!userAgent || BOT.test(userAgent)) return false;
  return attribution !== null || path === "/guides" || path.startsWith("/guides/");
}
