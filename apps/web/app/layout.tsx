import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "./_components/MotionProvider";
import { siteUrl } from "@/lib/siteUrl";

// The brand typeface was a system-font wish: "Avenir Next" only exists on
// Apple hardware, so the wordmark rendered as Helvetica for everyone on
// Windows, Android and the demo projector. Self-hosted here — downloaded at
// build time, no runtime request to Google.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

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

// The gateway origin is build-time inlined; absent in same-origin proxy setups.
const gatewayOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
})();

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>
        {/* Warm the TLS+DNS path to the media gateway before the first
            segment's assets are fetched. */}
        {gatewayOrigin ? (
          <>
            <link rel="preconnect" href={gatewayOrigin} />
            <link rel="dns-prefetch" href={gatewayOrigin} />
          </>
        ) : null}
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
