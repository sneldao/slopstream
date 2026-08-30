import type { Metadata } from "next";
import "./globals.css";
import { MotionProvider } from "./_components/MotionProvider";

export const metadata: Metadata = {
  title: "Slopstream",
  description: "The world's first live attention market.",
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
