import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";

/** Public surfaces — `/` redirects to `/screen`. */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteUrl();
  const now = new Date();

  return [
    {
      url: `${baseUrl}/screen`,
      lastModified: now,
      changeFrequency: "always",
      priority: 1,
    },
    {
      url: `${baseUrl}/listen`,
      lastModified: now,
      changeFrequency: "always",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/brand`,
      lastModified: now,
      changeFrequency: "always",
      priority: 0.8,
    },
  ];
}
