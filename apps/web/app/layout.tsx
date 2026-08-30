import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MotionProvider } from "./_components/MotionProvider";
import { siteUrl } from "@/lib/siteUrl";

const baseUrl = siteUrl();
const title = "Slopstream — the live attention market";
const description =
  "Brands bid for verified attention. Listeners earn from the cleared spend. The world's first live attention market.";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: title,
    template: "%s · Slopstream",
  },
  description,
  applicationName: "Slopstream",
  keywords: [
    "attention market",
    "live ads",
    "AI ad generation",
    "verified attention",
    "listener rewards",
    "real-time auction",
    "Slopstream",
  ],
  authors: [{ name: "Slopstream" }],
  creator: "Slopstream",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: baseUrl,
    siteName: "Slopstream",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Slopstream",
  },
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1e8" },
    { media: "(prefers-color-scheme: dark)", color: "#080812" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
