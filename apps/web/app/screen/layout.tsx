import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Screen",
  description:
    "The big screen — a live broadcast where brands bid, ads play, and attention becomes visible.",
};

export default function ScreenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
