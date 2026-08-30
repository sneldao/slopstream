import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";

/**
 * robots.txt — allow all crawlers, point them at the sitemap.
 * The three surfaces (/screen, /listen, /brand) are all indexable;
 * there are no private routes to disallow.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = siteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
