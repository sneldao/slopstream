import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStreamMode } from "@/lib/streamMode";
import { SphereField } from "./_components/SphereField";
import { SurfaceNav } from "./_components/SurfaceNav";

export const metadata: Metadata = {
  title: "Slopstream — the live attention market",
  description:
    "Brands bid for verified attention. Listeners earn from the cleared spend. The world's first live attention market.",
};

const SURFACES = [
  {
    href: "/screen",
    index: "01",
    eyebrow: "The spectacle",
    title: "Enter the live world",
    description: "Bids, ads, and attention — visible in one room.",
    color: "var(--slop-coral)",
  },
  {
    href: "/listen",
    index: "02",
    eyebrow: "The pocket portal",
    title: "Listen. Prove. Earn.",
    description: "Join the stream. Opt in to earn.",
    color: "var(--slop-blue)",
  },
  {
    href: "/brand",
    index: "03",
    eyebrow: "The auction cockpit",
    title: "Put your brand in play",
    description: "Bid for the next moment.",
    color: "var(--slop-violet)",
  },
] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ hub?: string }>;
}) {
  // NEXT_PUBLIC_STREAM_MODE is build-inlined, so in demo builds the branch
  // below never runs and "/" stays statically prerendered: searchParams is
  // only awaited in live mode.
  if (getStreamMode() === "live") {
    // Live network: skip the role-router hub and drop viewers straight into
    // the spectacle. The hub stays reachable "via nav only" — the wordmark
    // and dock link to /?hub=1, which bypasses this redirect.
    const { hub } = await searchParams;
    if (hub !== "1") redirect("/screen");
  }

  return <HomeHub />;
}

// Demo mode keeps / as the canonical map since the fixture is the product;
// live mode lands here only via the ?hub=1 opt-out.
function HomeHub() {
  const mode = getStreamMode();

  return (
    <main className="home-shell has-dock">
      <SphereField />
      <div className="slop-grain" />

      <SurfaceNav
        tone="light"
        trailing={
          <div className={`home-mode home-mode--${mode}`}>
            <span /> {mode === "live" ? "Live network" : "Demo broadcast"}
          </div>
        }
      />

      <section className="home-hero" id="top">
        <div className="home-hero__intro">
          <span className="slop-kicker">The attention market is open</span>
          <p>Bid for the moment. Reward the people who were really there.</p>
        </div>
        <h1 aria-label="Slopstream">
          <span>Slop</span>
          <span>Stream</span>
        </h1>
        <div className="home-hero__stamp" aria-hidden="true">
          <span>Live</span>
          <strong>Attention</strong>
          <span>Market</span>
        </div>
      </section>

      <section className="home-surfaces" aria-label="Choose an experience">
        {SURFACES.map((surface) => (
          <a
            className="home-surface"
            href={surface.href}
            key={surface.href}
            style={{ "--surface-color": surface.color } as CSSProperties}
          >
            <span className="home-surface__index">{surface.index}</span>
            <span className="home-surface__copy">
              <small>{surface.eyebrow}</small>
              <strong>{surface.title}</strong>
              <span>{surface.description}</span>
            </span>
            <span className="home-surface__arrow" aria-hidden="true">
              ↗
            </span>
          </a>
        ))}
      </section>

      <footer className="home-footer">
        <span>Attention is the currency.</span>
        <span>Proof is the receipt.</span>
        <span>Everybody gets paid.</span>
      </footer>

      <p className="home-operator">
        Screen → projector · Listen → phone · Brand → laptop
      </p>
    </main>
  );
}
