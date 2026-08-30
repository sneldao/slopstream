import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MotionProvider } from "./_components/MotionProvider";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const title = "Slopstream — the live attention market";
const description =
  "Brands bid for verified attention. Listeners earn from the cleared spend. The world's first live attention market.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
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
