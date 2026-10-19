import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify",
  description:
    "Independently verify a Slopstream attention proof against the Midnight preprod contract state — no trust in Slopstream required.",
};

export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
