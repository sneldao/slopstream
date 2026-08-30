"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStream } from "@/lib/useStream";
import { useAudioSignal } from "@/lib/useAudioSignal";
import { useSoundDesign } from "@/lib/useSoundDesign";
import { AmbientCanvas } from "./_components/AmbientCanvas";
import { NowPlaying } from "./_components/NowPlaying";
import { LiquidThreshold } from "./_components/LiquidThreshold";
import { StatsFooter } from "./_components/StatsFooter";
import { OutbidFlashOverlay } from "./_components/OutbidFlash";
import { ClearBurstFlow } from "./_components/ClearBurstFlow";
import { BlobChip } from "./_components/SoftBlob";
import { DemoControls } from "./_components/DemoControls";

export default function ScreenPage() {
  const { state, demo } = useStream();
  const { signalRef } = useAudioSignal(!!state.nowPlaying);
  const { play } = useSoundDesign();

  // Active brand drives the canvas tint.
  const activeBrandId =
    state.nowPlaying?.brandId ?? state.generation?.brandId ?? null;
  const activeBrand = activeBrandId
    ? state.brandById[activeBrandId]
    : undefined;

  // Set brand-palette CSS variables.
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

  // Sound design — fire on event changes.
  const lastOutbidId = useRef(0);
  const lastClearId = useRef(0);
  const lastChallengeId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.lastOutbid && state.lastOutbid.flashId !== lastOutbidId.current) {
      lastOutbidId.current = state.lastOutbid.flashId;
      play("outbid");
    }
  }, [state.lastOutbid, play]);
  useEffect(() => {
    if (state.lastClear && state.lastClear.burstId !== lastClearId.current) {
      lastClearId.current = state.lastClear.burstId;
      play("clear");
    }
  }, [state.lastClear, play]);
  useEffect(() => {
    if (
      state.activeChallenge &&
      state.activeChallenge.id !== lastChallengeId.current
    ) {
      lastChallengeId.current = state.activeChallenge.id;
      play("challenge");
    }
  }, [state.activeChallenge, play]);

  // OUTBID burst trigger for the ambient canvas.
  const burstKey = state.lastOutbid?.flashId ?? 0;
  const burstFromColor = state.lastOutbid
    ? state.brandById[state.lastOutbid.displacedBrandId]?.primaryColor
    : undefined;
  const burstToColor = state.lastOutbid
    ? state.brandById[state.lastOutbid.newBrandId]?.primaryColor
    : undefined;

  return (
    <main style={styles.main}>
      {/* The living canvas — ambient particles behind everything. */}
      <AmbientCanvas
        signalRef={signalRef}
        brandColor={activeBrand?.primaryColor ?? "#1a1a3e"}
        secondaryColor={activeBrand?.secondaryColor ?? "#0b0b1a"}
        burstKey={burstKey}
        burstFromColor={burstFromColor}
        burstToColor={burstToColor}
      />

      {/* Full-bleed now-playing — the stage takes the whole screen. */}
      <div style={styles.stage}>
        <NowPlaying
          nowPlaying={state.nowPlaying}
          nowPlayingStartedAt={state.nowPlayingStartedAt}
          brand={activeBrand}
          generation={state.generation}
          activeChallenge={state.activeChallenge}
          signalRef={signalRef}
        />
        <OutbidFlashOverlay
          flash={state.lastOutbid}
          brandById={state.brandById}
        />
        <ClearBurstFlow burst={state.lastClear} brand={activeBrand} />
      </div>

      {/* Floating header — minimal, top-left. */}
      <motion.header
        style={styles.header}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
      >
        <span style={styles.liveDot} />
        <span style={styles.title}>SLOPSTREAM</span>
      </motion.header>

      {/* Floating leaderboard — right side, over the canvas. */}
      <motion.div
        style={styles.leaderboardFloat}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 200, damping: 20 }}
      >
        <div style={styles.leaderboardHeader}>
          <span style={styles.leaderboardTitle}>LIVE BIDS</span>
          {state.nextSlotPriceUsd > 0 && (
            <span style={styles.nextSlot}>
              next slot{" "}
              <span style={styles.nextPrice}>${state.nextSlotPriceUsd}</span>
            </span>
          )}
        </div>
        <div style={styles.chipsColumn}>
          <AnimatePresence mode="popLayout">
            {state.leaderboard.map((entry, i) => {
              const b = state.brandById[entry.brandId];
              return (
                <BlobChip
                  key={entry.brandId}
                  name={b?.name ?? entry.brandId}
                  amount={`$${entry.amountUsd.toFixed(0)}`}
                  color={b?.primaryColor ?? "#666"}
                  secondaryColor={b?.secondaryColor ?? "#333"}
                  rank={i + 1}
                  isLeader={i === 0}
                  signalRef={signalRef}
                />
              );
            })}
          </AnimatePresence>
          {state.leaderboard.length === 0 && (
            <div style={styles.emptyBids}>The market is open.</div>
          )}
        </div>
      </motion.div>

      {/* Floating attention threshold — bottom-left, over the canvas. */}
      {state.attention && (
        <motion.div
          style={styles.thresholdFloat}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ type: "spring", stiffness: 200, damping: 22 }}
        >
          <LiquidThreshold attention={state.attention} signalRef={signalRef} />
        </motion.div>
      )}

      {/* Drifting stats — bottom center, no border, floating. */}
      <motion.div
        style={styles.statsFloat}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <StatsFooter
          listeners={state.listeners}
          attentionProofs={state.attentionProofs}
          listenerRewardsUsd={state.listenerRewardsUsd}
        />
      </motion.div>

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
  main: {
    position: "relative",
    minHeight: "100vh",
    overflow: "hidden",
  },
  stage: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
  },
  header: {
    position: "fixed",
    top: "clamp(16px, 3vw, 32px)",
    left: "clamp(16px, 3vw, 32px)",
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#ff3b3b",
    boxShadow: "0 0 12px #ff3b3b",
    animation: "slop-breathe 1.4s ease-in-out infinite",
  },
  title: {
    fontSize: "clamp(14px, 1.8vw, 20px)",
    fontWeight: 900,
    letterSpacing: 6,
    color: "rgba(255,255,255,0.9)",
  },
  leaderboardFloat: {
    position: "fixed",
    top: "clamp(60px, 10vh, 100px)",
    right: "clamp(16px, 3vw, 40px)",
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    maxWidth: 300,
  },
  leaderboardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
  },
  leaderboardTitle: {
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: 800,
    color: "var(--platform-text-dim)",
  },
  nextSlot: { fontSize: 11, color: "var(--platform-text-dim)" },
  nextPrice: { fontWeight: 800, color: "var(--platform-accent)", fontSize: 14 },
  chipsColumn: { display: "flex", flexDirection: "column", gap: 12 },
  emptyBids: {
    fontSize: 14,
    color: "var(--platform-text-dim)",
    fontStyle: "italic",
    padding: 12,
  },
  thresholdFloat: {
    position: "fixed",
    bottom: "clamp(60px, 10vh, 100px)",
    left: "clamp(16px, 3vw, 40px)",
    zIndex: 10,
    width: 300,
  },
  statsFloat: {
    position: "fixed",
    bottom: "clamp(16px, 3vw, 32px)",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
  },
};
