import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Listen",
  description:
    "Join the stream, prove you were paying attention, and earn from the cleared ad spend.",
};

export default function ListenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
