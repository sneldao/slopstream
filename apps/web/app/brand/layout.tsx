import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Brand",
  description:
    "The brand bidding console — bid for the next ad slot and watch your campaign enter the live market.",
};

export default function BrandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
