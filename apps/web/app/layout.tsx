import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slopstream",
  description: "The world's first live attention market.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
