"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useStream } from "@/lib/useStream";
import { useAudioSignal } from "@/lib/useAudioSignal";
import { useSoundDesign } from "@/lib/useSoundDesign";
import { useTheaterMode } from "@/lib/useTheaterMode";
import { FREE_BRAND_ID, FREE_BRAND_SUMMARY } from "@slopstream/shared";
import { NowPlaying } from "./_components/watch/NowPlaying";
import { StatsFooter } from "./_components/watch/StatsFooter";
import { OutbidFlashOverlay } from "./_components/watch/OutbidFlash";
import { BlobChip } from "./_components/watch/SoftBlob";
import { ProofReceipt3D } from "./_components/watch/ProofReceipt3D";
import { MarketHero } from "./_components/watch/MarketHero";
import { EarnCta } from "./_components/watch/EarnCta";
import { SurfaceHeader } from "./_components/SurfaceHeader";
import { LoopStatus } from "./_components/LoopStatus";
import { listenerJoinUrl } from "@/lib/listenerJoinUrl";

// The Continuum reads browser-only animation and pointer state.
const Scene = dynamic(
  () => import("./_components/watch/Scene").then((m) => m.Scene),
  { ssr: false },
);

/** The Continuum — live stream home at `/`. */
export default function HomePage() {
  const { state, connectionStatus } = useStream();
  const { theater, toggle: toggleTheater } = useTheaterMode(true);
  const [marketOpen, setMarketOpen] = useState(false);
  const showMarket = !theater && marketOpen;
  // Audio-tier segments have .mp3 as the asset; image/video tiers store the
  // visual as assetUrl but the .mp3 TTS file exists alongside on the generator.
  const audioUrl = state.nowPlaying?.assetUrl
    ? state.nowPlaying.assetUrl.match(/\.(mp3|wav|ogg)$/i)
      ? state.nowPlaying.assetUrl
      : state.nowPlaying.assetUrl.replace(/\.(mp4|png|jpe?g|webp)$/i, ".mp3")
    : undefined;
  const { signalRef, unlock, muted, toggleMute } = useAudioSignal(
    !!state.nowPlaying,
    audioUrl,
  );
  const { play } = useSoundDesign();
  // Resolved client-side only: a prerendered/projector frame has no
  // window.location.origin, and initializing with the localhost fallback
  // would paint a broken QR before the hydration effect runs.
  const [listenerUrl, setListenerUrl] = useState<string | null>(null);
  const [audioStarted, setAudioStarted] = useState(false);

  useEffect(() => {
    setListenerUrl(listenerJoinUrl(window.location.origin));
  }, []);

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
  // OUTBID burst trigger for the ambient canvas.
  const burstKey = state.lastOutbid?.flashId ?? 0;

  const idleRecruit = !state.nowPlaying && !state.generation;

  return (
    <main
      className={`screen-continuum-shell${theater ? " is-theater" : ""}`}
      style={styles.main}
    >
      {/* The Continuum — media is the world; brand colour, archive fragments,
          physical spheres and event ripples create the surrounding depth. */}
      <Scene
        signalRef={signalRef}
        colorA={fluidBrand?.primaryColor ?? "#2563eb"}
        colorB={fluidBrand?.secondaryColor ?? "#7dd3fc"}
        shockwaveKey={burstKey}
        leaderboard={state.leaderboard}
        brandById={state.brandById}
        // Ad surface (Phase 4)
        segment={state.nowPlaying}
        recentSegments={state.recentSegments}
        generation={state.generation}
        playingTier={state.playingTier}
        // Threshold basin (Phase 5)
        attention={state.attention}
        // Clearing streams (Phase 5)
        lastClear={state.lastClear}
        // Static colour field shown if the scene fails to render.
        fallbackBrandColor={activeBrand?.primaryColor ?? "#8f5cff"}
        fallbackSecondaryColor={activeBrand?.secondaryColor ?? "#ff5c58"}
        marketOpen={showMarket}
      />
      <div className="slop-grain" />

      {/* Click-to-start overlay — browsers block autoplay until a user
          gesture. This full-screen prompt unlocks the AudioContext on the
          first click, then disappears for the rest of the session. */}
      {!audioStarted && (
        <button
          className="screen-start-overlay"
          style={styles.startOverlay}
          onClick={() => {
            unlock();
            setAudioStarted(true);
          }}
          aria-label="Click to watch and listen to the stream"
        >
          <span style={styles.startIcon} aria-hidden>
            ▶
          </span>
          <span style={styles.startText}>Click to watch + listen</span>
        </button>
      )}

      {/* Mute toggle — visible after audio is unlocked. */}
      {audioStarted && !theater && (
        <button
          className="screen-mute-toggle"
          style={styles.muteToggle}
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      )}

      {/* Crisp editorial labels remain HTML above the moving media world. */}
      <div style={styles.stage}>
        <NowPlaying
          nowPlaying={state.nowPlaying}
          nowPlayingStartedAt={state.nowPlayingStartedAt}
          brand={activeBrand}
          generation={state.generation}
          activeChallenge={state.activeChallenge}
          encore={!!state.nowPlayingEncore}
          signalRef={signalRef}
          nextSlotPriceUsd={state.nextSlotPriceUsd}
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

      {/* Content-first chrome: the stream is the default; market detail is
          opt-in so the video can carry the first impression. */}
      <SurfaceHeader
        variant="spectacle"
        tone="light"
        sticky
        hidden={theater}
        trailing={
          !theater ? (
            <span
              className="slop-hud-pill"
              style={{
                color: connectionStatus === "connected" ? "#b8ff65" : "#ffe45e",
              }}
            >
              <span style={styles.connectionDot} />
              {connectionStatus === "connected" ? "Live" : "Offline"}
            </span>
          ) : null
        }
      />

      <button
        type="button"
        className="screen-view-toggle"
        style={styles.viewToggle}
        aria-pressed={showMarket}
        aria-label={
          theater
            ? "Exit focus mode"
            : showMarket
              ? "Focus on the video"
              : "Zoom out to show the market"
        }
        onClick={() => {
          if (theater) {
            toggleTheater();
          } else {
            setMarketOpen((open) => !open);
          }
        }}
      >
        {theater
          ? "Exit focus"
          : showMarket
            ? "Focus video"
            : "Show market · zoom out"}
      </button>

      {showMarket && (
        <LoopStatus state={state} tone="light" className="screen-loop-status" />
      )}

      {/* The Market Hero — available on demand so the auction supports the
          stream rather than competing with the first impression. */}
      {showMarket && (
        <div className="screen-market-hero" style={styles.marketHeroAnchor}>
          <MarketHero
            leaderboard={state.leaderboard}
            brandById={state.brandById}
            nextSlotPriceUsd={state.nextSlotPriceUsd}
            currentAuction={state.currentAuction}
            recentSegments={state.recentSegments}
            clearedBidExplanation={state.lastSettlement?.explanation}
          />
        </div>
      )}

      {showMarket && (
        <motion.div
          className="screen-leaderboard"
          style={styles.leaderboardFloat}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            delay: 0.4,
            type: "spring",
            stiffness: 200,
            damping: 20,
          }}
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
              <div style={styles.emptyBids}>Waiting for bids</div>
            )}
          </div>
        </motion.div>
      )}

      {/* Coming Up — the next 1-2 segments in the queue. */}
      {showMarket && state.upcomingSegments.length > 0 && (
        <motion.div
          className="screen-coming-up"
          style={styles.comingUp}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            delay: 0.5,
            type: "spring",
            stiffness: 200,
            damping: 22,
          }}
        >
          <div style={styles.comingUpHeader}>COMING UP</div>
          <div style={styles.comingUpList}>
            {state.upcomingSegments.map((seg, i) => {
              const b = seg.brandId ? state.brandById[seg.brandId] : undefined;
              const isFree = !seg.brandId;
              const name = b?.name ?? "FREE — nobody paid";
              return (
                <div key={seg.id} style={styles.comingUpItem}>
                  <span
                    style={{
                      ...styles.comingUpDot,
                      background: isFree
                        ? "rgba(16,16,20,0.25)"
                        : (b?.primaryColor ?? "#888"),
                    }}
                  />
                  <span style={styles.comingUpName}>{name}</span>
                  {seg.status === "generating" && (
                    <span style={styles.comingUpStatus}>generating</span>
                  )}
                  {seg.status === "ready" && (
                    <span style={styles.comingUpStatus}>ready</span>
                  )}
                  {isFree && <span style={styles.comingUpFree}>free</span>}
                  {i === 0 && <span style={styles.comingUpNext}>next</span>}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Earn CTA — the QR promoted to a first-class call to action. */}
      <EarnCta
        listenerUrl={listenerUrl}
        idleRecruit={idleRecruit}
        activeChallenge={!!state.activeChallenge}
        theater={theater}
      />

      {showMarket && state.attention && (
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

      {showMarket && (
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
            placedVolumeUsd={state.placedVolumeUsd}
            totalClearedVolumeUsd={state.totalClearedVolumeUsd}
          />
        </motion.div>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  startOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    background: "rgba(11,11,26,0.72)",
    backdropFilter: "blur(8px)",
    border: "none",
    cursor: "pointer",
    color: "var(--slop-cream, #f4f1e8)",
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  startIcon: {
    fontSize: 48,
    lineHeight: 1,
  },
  startText: {
    fontSize: 14,
    letterSpacing: 3,
    opacity: 0.8,
  },
  muteToggle: {
    position: "fixed",
    top: "clamp(16px, 3vw, 32px)",
    right: "clamp(16px, 3vw, 40px)",
    zIndex: 15,
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    border: "1px solid rgba(16,16,20,0.22)",
    background: "rgba(244,241,232,0.9)",
    backdropFilter: "blur(12px)",
    cursor: "pointer",
    fontSize: 18,
    boxShadow: "3px 3px 0 rgba(16,16,20,0.12)",
  },
  main: {
    position: "relative",
    minHeight: "100vh",
    overflow: "hidden",
    background: "var(--slop-cream)",
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
    color: "rgba(16,16,20,0.66)",
  },
  nextSlot: { fontSize: 11, color: "rgba(16,16,20,0.58)" },
  nextPrice: { fontWeight: 900, color: "var(--slop-ink)", fontSize: 14 },
  chipsColumn: { display: "flex", flexDirection: "column", gap: 12 },
  emptyBids: {
    fontSize: 14,
    color: "rgba(16,16,20,0.58)",
    fontStyle: "italic",
    padding: 12,
  },
  comingUp: {
    position: "fixed",
    top: "auto",
    bottom: "clamp(110px, 18vh, 180px)",
    right: "clamp(16px, 3vw, 40px)",
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxWidth: 260,
    padding: "12px 14px",
    borderRadius: 16,
    background: "rgba(8,8,18,0.64)",
    backdropFilter: "blur(14px)",
    border: "1px solid rgba(255,255,255,0.14)",
  },
  comingUpHeader: {
    fontSize: 10,
    letterSpacing: 2.5,
    fontWeight: 900,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
  },
  comingUpList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  comingUpItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 700,
    color: "rgba(255,255,255,0.88)",
  },
  comingUpDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  comingUpName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  comingUpStatus: {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "var(--slop-yellow)",
    padding: "2px 6px",
    borderRadius: 999,
    background: "rgba(255,228,94,0.12)",
  },
  comingUpNext: {
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "var(--slop-ink)",
    background: "var(--slop-yellow)",
    padding: "2px 7px",
    borderRadius: 999,
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
    background: "rgba(244,241,232,0.9)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(16,16,20,0.22)",
    boxShadow: "3px 3px 0 rgba(16,16,20,0.14)",
  },
  thresholdCount: {
    fontSize: 22,
    fontWeight: 900,
    color: "var(--slop-ink)",
    fontVariantNumeric: "tabular-nums",
  },
  thresholdSlash: {
    fontSize: 16,
    color: "rgba(16,16,20,0.4)",
  },
  thresholdTarget: {
    fontSize: 16,
    fontWeight: 700,
    color: "rgba(16,16,20,0.6)",
    fontVariantNumeric: "tabular-nums",
  },
  thresholdLabel2: {
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(16,16,20,0.58)",
    marginLeft: 4,
  },
  marketHeroAnchor: {
    position: "fixed",
    top: "clamp(14px, 2.5vw, 26px)",
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    zIndex: 10,
    pointerEvents: "none",
  },
  statsFloat: {
    position: "fixed",
    bottom: "clamp(16px, 3vw, 32px)",
    left: "clamp(16px, 3vw, 32px)",
    zIndex: 10,
  },
  viewToggle: {
    position: "fixed",
    top: "clamp(60px, 9vh, 92px)",
    left: "clamp(16px, 3vw, 40px)",
    zIndex: 16,
    minHeight: 34,
    padding: "8px 12px",
    border: "1px solid rgba(16,16,20,0.24)",
    borderRadius: 999,
    background: "rgba(244,241,232,0.86)",
    backdropFilter: "blur(12px)",
    color: "var(--slop-ink)",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    cursor: "pointer",
    boxShadow: "3px 3px 0 rgba(16,16,20,0.14)",
  },
  comingUpFree: {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(244,241,232,0.66)",
    border: "1px dashed rgba(244,241,232,0.4)",
    padding: "2px 6px",
    borderRadius: 999,
  },
};
