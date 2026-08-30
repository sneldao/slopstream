import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MotionProvider } from "./_components/MotionProvider";

export const metadata: Metadata = {
  title: "Slopstream",
  description: "The world's first live attention market.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Slopstream",
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
