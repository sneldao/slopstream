import type { CSSProperties } from "react";
import { SphereField } from "./_components/SphereField";

const SURFACES = [
  {
    href: "/screen",
    index: "01",
    eyebrow: "The spectacle",
    title: "Enter the live world",
    description:
      "A fluid broadcast where brands collide, bids burst and attention becomes visible.",
    color: "var(--slop-coral)",
  },
  {
    href: "/listen",
    index: "02",
    eyebrow: "The pocket portal",
    title: "Listen. Prove. Earn.",
    description:
      "Join the stream, catch the cue and turn real attention into a reward.",
    color: "var(--slop-blue)",
  },
  {
    href: "/brand",
    index: "03",
    eyebrow: "The auction cockpit",
    title: "Put your brand in play",
    description:
      "Bid for the next moment and watch your campaign enter the living canvas.",
    color: "var(--slop-violet)",
  },
] as const;

export default function Home() {
  const mode = process.env.NEXT_PUBLIC_STREAM_MODE === "live" ? "live" : "demo";

  return (
    <main className="home-shell">
      <SphereField />
      <div className="slop-grain" />

      <header className="home-nav">
        <a
          className="slop-wordmark home-wordmark"
          href="#top"
          aria-label="Slopstream home"
        >
          Slopstream
        </a>
        <div className={`home-mode home-mode--${mode}`}>
          <span /> {mode === "live" ? "Live network" : "Demo broadcast"}
        </div>
      </header>

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
    </main>
  );
}
