"use client";

import { useEffect } from "react";
import { useStream } from "@/lib/useStream";
import { Leaderboard } from "./_components/Leaderboard";
import { NowPlaying } from "./_components/NowPlaying";
import { AttentionThreshold } from "./_components/AttentionThreshold";
import { StatsFooter } from "./_components/StatsFooter";
import { OutbidFlashOverlay } from "./_components/OutbidFlash";
import { ClearBurst } from "./_components/ClearBurst";
import { DemoControls } from "./_components/DemoControls";

export default function ScreenPage() {
  const { state, demo } = useStream();

  // Active brand drives the canvas tint: the playing brand, else the
  // generating brand, else the platform aurora (no brand).
  const activeBrandId =
    state.nowPlaying?.brandId ?? state.generation?.brandId ?? null;
  const activeBrand = activeBrandId
    ? state.brandById[activeBrandId]
    : undefined;

  // Set the brand-palette CSS variables on the canvas so the whole screen
  // takes on the current advertiser's identity (design-language.md).
  useEffect(() => {
    const root = document.documentElement;
    if (activeBrand) {
      root.style.setProperty("--brand-primary", activeBrand.primaryColor);
      root.style.setProperty("--brand-secondary", activeBrand.secondaryColor);
      root.style.setProperty("--brand-glow", `${activeBrand.primaryColor}33`);
    } else {
      root.style.setProperty("--brand-primary", "var(--platform-bg-2)");
      root.style.setProperty("--brand-secondary", "var(--platform-bg-1)");
      root.style.setProperty("--brand-glow", "rgba(255,215,106,0.18)");
    }
  }, [activeBrand]);

  return (
    <main style={styles.main}>
      <div className="slop-canvas" />

      <div style={styles.frame}>
        <header style={styles.header}>
          <span style={styles.liveDot} />
          <span style={styles.title}>LIVE SLOPSTREAM</span>
        </header>

        <section style={styles.stage}>
          <NowPlaying
            nowPlaying={state.nowPlaying}
            nowPlayingStartedAt={state.nowPlayingStartedAt}
            brand={activeBrand}
            generation={state.generation}
            activeChallenge={state.activeChallenge}
          />
          <OutbidFlashOverlay
            flash={state.lastOutbid}
            brandById={state.brandById}
          />
          <ClearBurst burst={state.lastClear} brand={activeBrand} />
        </section>

        <section style={styles.market}>
          <Leaderboard
            ranking={state.leaderboard}
            brandById={state.brandById}
            nextSlotPriceUsd={state.nextSlotPriceUsd}
          />
          <AttentionThreshold attention={state.attention} />
        </section>

        <footer style={styles.footer}>
          <StatsFooter
            listeners={state.listeners}
            attentionProofs={state.attentionProofs}
            listenerRewardsUsd={state.listenerRewardsUsd}
          />
        </footer>
      </div>

      <DemoControls
        playing={demo.playing}
        finished={demo.finished}
        stepIndex={demo.stepIndex}
        totalSteps={demo.totalSteps}
        label={demo.label}
        onToggle={demo.toggle}
        onRestart={demo.restart}
        onStep={demo.stepNext}
      />
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { position: "relative", minHeight: "100vh", overflow: "hidden" },
  frame: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 20,
    padding: "clamp(16px, 3vw, 40px)",
    minHeight: "100vh",
    maxWidth: 1400,
    margin: "0 auto",
  },
  header: { display: "flex", alignItems: "center", gap: 12 },
  liveDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#ff3b3b",
    boxShadow: "0 0 14px #ff3b3b",
    animation: "slop-breathe 1.4s ease-in-out infinite",
  },
  title: {
    fontSize: "clamp(18px, 2.4vw, 28px)",
    fontWeight: 900,
    letterSpacing: 6,
    color: "#fff",
  },
  stage: {
    position: "relative",
    flex: 1,
    minHeight: "clamp(280px, 42vh, 520px)",
  },
  market: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr",
    gap: 28,
    alignItems: "start",
  },
  footer: { paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)" },
};
