import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";
import { getStreamMode } from "@/lib/streamMode";

/**
 * sitemap.xml — the public surfaces, mode-aware.
 *
 * Live mode redirects "/" to /screen, so the sitemap lists /screen as the
 * primary page and omits "/" entirely. Demo mode keeps the hub ("/") as the
 * canonical landing page with the three surfaces beneath it.
 * (NEXT_PUBLIC_STREAM_MODE / NEXT_PUBLIC_SITE_URL are build-inlined.)
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteUrl();
  const now = new Date();

  if (getStreamMode() === "live") {
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

  const routes = ["/", "/screen", "/listen", "/brand"] as const;

  return routes.map((route) => ({
    url: `${baseUrl}${route === "/" ? "" : route}`,
    lastModified: now,
    changeFrequency: route === "/" ? "weekly" : "always",
    priority: route === "/" ? 1 : 0.8,
  }));
}
