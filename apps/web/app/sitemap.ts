import type { MetadataRoute } from "next";

/**
 * sitemap.xml — the four public surfaces.
 * The homepage is the landing; /screen, /listen, and /brand are the
 * three experience surfaces linked from the homepage nav.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const now = new Date();

  const routes = ["/", "/screen", "/listen", "/brand"] as const;

  return routes.map((route) => ({
    url: `${baseUrl}${route === "/" ? "" : route}`,
    lastModified: now,
    changeFrequency: route === "/" ? "weekly" : "always",
    priority: route === "/" ? 1 : 0.8,
  }));
}
