import type { MetadataRoute } from "next";

/**
 * Web app manifest — lets the three surfaces be installed as PWA shortcuts
 * on phones and projectors. The screen surface especially benefits from
 * standalone display mode (no browser chrome on the projector).
 *
 * Every URL here is origin-relative on purpose. The manifest is served from
 * whatever host the visitor is on, so an absolute origin baked in at build
 * time is foreign the moment the app runs anywhere else — Chrome then drops
 * `start_url`, narrows scope to the document directory, and discards the
 * shortcuts for falling outside it. `siteUrl()` stays for SEO (sitemap,
 * robots, metadata), where a fully qualified URL is the requirement.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Slopstream",
    short_name: "Slopstream",
    description: "The world's first live attention market.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#080812",
    theme_color: "#080812",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcuts: [
      {
        name: "Watch",
        short_name: "Watch",
        description: "The live stream",
        url: "/",
      },
      {
        name: "Listen",
        short_name: "Listen",
        description: "Listen, prove attention, earn",
        url: "/listen",
      },
      {
        name: "Brand",
        short_name: "Brand",
        description: "Brand bidding console",
        url: "/brand",
      },
    ],
  };
}
