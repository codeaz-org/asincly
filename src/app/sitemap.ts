import type { MetadataRoute } from "next";
import { isBillingEnabled } from "@/lib/billing/plans";
import { listGuides } from "@/lib/guides";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const pages: MetadataRoute.Sitemap = [{ url: `${base}/` }];
  // Marketing pages exist on the hosted cloud only.
  if (isBillingEnabled()) {
    pages.push({ url: `${base}/pricing` }, { url: `${base}/guides` });
    for (const g of await listGuides()) pages.push({ url: `${base}/guides/${g.slug}`, lastModified: g.date });
  }
  return pages;
}
