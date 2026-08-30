import type { MetadataRoute } from "next";

/**
 * Web app manifest — lets the three surfaces be installed as PWA shortcuts
 * on phones and projectors. The screen surface especially benefits from
 * standalone display mode (no browser chrome on the projector).
 */
export default function manifest(): MetadataRoute.Manifest {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    name: "Slopstream",
    short_name: "Slopstream",
    description: "The world's first live attention market.",
    start_url: `${baseUrl}/`,
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
        name: "Screen",
        short_name: "Screen",
        description: "The big screen — live broadcast",
        url: `${baseUrl}/screen`,
      },
      {
        name: "Listen",
        short_name: "Listen",
        description: "Listen, prove attention, earn",
        url: `${baseUrl}/listen`,
      },
      {
        name: "Brand",
        short_name: "Brand",
        description: "Brand bidding console",
        url: `${baseUrl}/brand`,
      },
    ],
  };
}
