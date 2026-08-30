import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Slopstream — the live attention market",
  description:
    "An infinite AI ad stream where attention is verified and listeners earn from cleared spend.",
};

/** The Continuum big screen is the product entry point. */
export default function Home() {
  redirect("/screen");
}
