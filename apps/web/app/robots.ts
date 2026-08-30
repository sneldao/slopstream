import type { MetadataRoute } from "next";

/**
 * robots.txt — allow all crawlers, point them at the sitemap.
 * The three surfaces (/screen, /listen, /brand) are all indexable;
 * there are no private routes to disallow.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
