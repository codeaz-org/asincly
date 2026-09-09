import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Everything behind auth or API is noise for crawlers.
      disallow: ["/api/", "/account", "/onboarding"],
    },
  };
}
