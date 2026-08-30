"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { useStream } from "@/lib/useStream";
import { useAudioSignal } from "@/lib/useAudioSignal";
import { useSoundDesign } from "@/lib/useSoundDesign";
import { FREE_BRAND_ID, FREE_BRAND_SUMMARY } from "@slopstream/shared";
import { NowPlaying } from "./_components/NowPlaying";
import { StatsFooter } from "./_components/StatsFooter";
import { OutbidFlashOverlay } from "./_components/OutbidFlash";
import { BlobChip } from "./_components/SoftBlob";
import { DemoControls } from "./_components/DemoControls";
import { ProofReceipt3D } from "./_components/ProofReceipt3D";

// 3D scene — loaded client-only to avoid SSR issues with WebGL.
const Scene = dynamic(
  () => import("./_components/Scene").then((m) => m.Scene),
  { ssr: false },
);

export default function ScreenPage() {
  const { state, mode, connectionStatus, demo } = useStream();
  // In live mode, play real audio from the segment's asset URL.
  // In demo mode, the asset URLs are placeholders that don't exist, so
  // the hook falls back to the synthesized signal.
  const audioUrl = state.nowPlaying?.assetUrl?.match(/\.(mp3|wav|ogg)$/i)
    ? state.nowPlaying.assetUrl
    : undefined;
  const { signalRef } = useAudioSignal(!!state.nowPlaying, audioUrl);
  const { play } = useSoundDesign();
  const listenerUrl =
    process.env.NEXT_PUBLIC_LISTENER_URL ?? "http://localhost:3000/listen";

  // Active brand drives the now-playing surface. Free segments (scraped
  // companies with no bid) have brandId null — map them to the FREE SLOP
  // brand so the screen still gets colours and a brand identity.
  const rawActiveBrandId =
    state.nowPlaying?.brandId ?? state.generation?.brandId ?? null;
  const activeBrandId = rawActiveBrandId ?? FREE_BRAND_ID;
  const activeBrand = state.brandById[activeBrandId] ?? FREE_BRAND_SUMMARY;

  // The bid leader drives the fluid tint. The design language says the screen
  // floods to the new leader's palette on OUTBID — so the fluid tracks who's
  // *winning the auction*, not who's *currently playing*. When the leader
  // changes, FluidBackground lerps the palette over ~600ms (the flood).
  // Falls back to the playing brand (or FREE SLOP) when there are no bids.
  const leaderBrandId = state.leaderboard[0]?.brandId ?? activeBrandId;
  const fluidBrand = state.brandById[leaderBrandId] ?? FREE_BRAND_SUMMARY;

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
      {/* The 3D fluid world — metaball shader, brand blobs, ad surface,
          threshold basin, clearing streams. The fluid tint follows the bid
          leader so OUTBID floods the palette. */}
      <Scene
        signalRef={signalRef}
        colorA={fluidBrand?.primaryColor ?? "#2563eb"}
        colorB={fluidBrand?.secondaryColor ?? "#7dd3fc"}
        shockwaveKey={burstKey}
        leaderboard={state.leaderboard}
        brandById={state.brandById}
        outbidFlashId={state.lastOutbid?.flashId ?? 0}
        outbidDisplacedBrandId={state.lastOutbid?.displacedBrandId}
        outbidNewBrandId={state.lastOutbid?.newBrandId}
        // Ad surface (Phase 4)
        segment={state.nowPlaying}
        generation={state.generation}
        playingTier={state.playingTier}
        // Threshold basin (Phase 5)
        attention={state.attention}
        // Clearing streams (Phase 5)
        lastClear={state.lastClear}
        // Canvas 2D fallback palette (used only if WebGL fails).
        fallbackBrandColor={activeBrand?.primaryColor ?? "#8f5cff"}
        fallbackSecondaryColor={activeBrand?.secondaryColor ?? "#ff5c58"}
        fallbackBurstKey={burstKey}
        fallbackBurstFromColor={burstFromColor}
        fallbackBurstToColor={burstToColor}
      />
      <div className="slop-grain" />

      {/* Text overlay — brand name, generation stages, challenge banner.
          The visual ad surface is now 3D (AdSurface inside Scene). */}
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
      </div>

      {/* Proof receipt — the calm center. Condenses from vapor on bid clear. */}
      <ProofReceipt3D
        burst={state.lastClear}
        brandName={activeBrand?.name}
        brandColor={activeBrand?.primaryColor}
      />

      {/* Floating header — wordmark + live status. Top-left, single row. */}
      <motion.header
        style={styles.header}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
      >
        <span style={styles.liveDot} />
        <a className="slop-wordmark" href="/" style={styles.title}>
          SLOPSTREAM
        </a>
        <span style={styles.broadcastTag}>Attention market / on air</span>
        {mode === "live" && (
          <span
            style={{
              ...styles.connectionBadge,
              color: connectionStatus === "connected" ? "#b8ff65" : "#ffe45e",
            }}
          >
            <span style={styles.connectionDot} />
            {connectionStatus === "connected" ? "Live" : "Offline"}
          </span>
        )}
      </motion.header>

      {/* Floating leaderboard — right side, over the canvas. */}
      <motion.div
        className="screen-leaderboard"
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

      <aside
        className="screen-join"
        style={styles.joinPanel}
        aria-label="Join Slopstream as a listener"
      >
        <div style={styles.qrFrame}>
          <QRCodeSVG
            value={listenerUrl}
            size={92}
            bgColor="#ffffff"
            fgColor="#0b0b1a"
            level="M"
            title="Listener join QR code"
          />
        </div>
        <div>
          <div style={styles.joinTitle}>SCAN TO JOIN</div>
          <div style={styles.joinCopy}>Prove attention. Earn rewards.</div>
        </div>
      </aside>

      {/* Attention threshold text — the 3D basin shows the visual fill;
          this small label shows the numbers. */}
      {state.attention && (
        <motion.div
          className="screen-threshold"
          style={styles.thresholdLabel}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 200, damping: 22 }}
        >
          <span style={styles.thresholdCount}>
            {state.attention.verifiedCount}
          </span>
          <span style={styles.thresholdSlash}> / </span>
          <span style={styles.thresholdTarget}>
            {state.attention.threshold}
          </span>
          <span style={styles.thresholdLabel2}> verified</span>
        </motion.div>
      )}

      {/* Drifting stats — bottom center, no border, floating. */}
      <motion.div
        className="screen-stats"
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

      {mode === "demo" && (
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
      )}
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
    pointerEvents: "none",
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
    textDecoration: "none",
  },
  broadcastTag: {
    padding: "6px 10px",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 999,
    color: "rgba(255,255,255,0.58)",
    background: "rgba(8,8,18,0.48)",
    backdropFilter: "blur(12px)",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  connectionBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 999,
    background: "rgba(8,8,18,0.64)",
    backdropFilter: "blur(14px)",
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginLeft: 4,
  },
  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "currentColor",
    boxShadow: "0 0 12px currentColor",
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
  thresholdLabel: {
    position: "fixed",
    bottom: "clamp(70px, 12vh, 110px)",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
    display: "flex",
    alignItems: "baseline",
    gap: 2,
    padding: "6px 16px",
    borderRadius: 999,
    background: "rgba(5,5,15,0.6)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  thresholdCount: {
    fontSize: 22,
    fontWeight: 900,
    color: "#fff",
    fontVariantNumeric: "tabular-nums",
  },
  thresholdSlash: {
    fontSize: 16,
    color: "rgba(255,255,255,0.4)",
  },
  thresholdTarget: {
    fontSize: 16,
    fontWeight: 700,
    color: "rgba(255,255,255,0.6)",
    fontVariantNumeric: "tabular-nums",
  },
  thresholdLabel2: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--platform-text-dim)",
    marginLeft: 4,
  },
  statsFloat: {
    position: "fixed",
    bottom: "clamp(16px, 3vw, 32px)",
    left: "clamp(16px, 3vw, 32px)",
    zIndex: 10,
  },
  joinPanel: {
    position: "fixed",
    right: "clamp(16px, 3vw, 40px)",
    bottom: "clamp(16px, 3vw, 32px)",
    zIndex: 12,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 14,
    background: "rgba(5,5,15,0.72)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.14)",
  },
  qrFrame: {
    display: "flex",
    padding: 6,
    borderRadius: 8,
    background: "#fff",
  },
  joinTitle: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 2,
    color: "#fff",
  },
  joinCopy: {
    marginTop: 5,
    maxWidth: 130,
    fontSize: 12,
    lineHeight: 1.35,
    color: "var(--platform-text-dim)",
  },
};
