"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BrandSummary, ProductionTier } from "@slopstream/shared";
import { TIER_BID_THRESHOLDS_USD } from "@slopstream/shared";
import { useStream } from "@/lib/useStream";
import { useSoundDesign } from "@/lib/useSoundDesign";
import { requestJson } from "@/lib/liveApi";
import { SphereField } from "../_components/SphereField";
import { SurfaceHeader } from "../_components/SurfaceHeader";
import { FirstRunCoach } from "../_components/FirstRunCoach";
import { LoopStatus } from "../_components/LoopStatus";
import { ScreenCrossLink } from "../_components/ScreenCrossLink";
import { tierForAmount, tierMin } from "@/lib/tierForAmount";

/**
 * The brand bidding console — live auction pressure, not form-filling.
 * Ambient brand-tinted glow, OUTBID alert with sound + vibration, tactile
 * tier chips, bid confirmation particle effect, live leaderboard.
 */
export default function BrandPage() {
  const { state, mode, connectionStatus } = useStream();
  const { play } = useSoundDesign();

  const DEMO_BRAND_ID = "brand_acme";
  const demoBrandToken = process.env.NEXT_PUBLIC_DEMO_BRAND_TOKEN;
  const [brandId, setBrandId] = useState(DEMO_BRAND_ID);
  const myBrand: BrandSummary | undefined = state.brandById[brandId];

  const [balance, setBalance] = useState(500);
  const [bidAmount, setBidAmount] = useState(27);
  const [outbidAlert, setOutbidAlert] = useState(false);
  const [lastOutbidFlashId, setLastOutbidFlashId] = useState<
    number | undefined
  >(undefined);
  const [bidPlaced, setBidPlaced] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [bidSubmitting, setBidSubmitting] = useState(false);

  useEffect(() => {
    if (mode !== "live") return;
    if (!demoBrandToken) {
      setBidError("Set NEXT_PUBLIC_DEMO_BRAND_TOKEN for the local demo brand.");
      return;
    }
    void requestJson<BrandBalanceResponse>(
      "/brands/me/balance",
      { method: "GET" },
      demoBrandToken,
    )
      .then(({ brand, balance: nextBalance }) => {
        setBrandId(brand.id);
        setBalance(nextBalance.availableUsd);
      })
      .catch((error: unknown) => {
        setBidError(errorMessage(error));
      });
  }, [demoBrandToken, mode]);

  useEffect(() => {
    const root = document.documentElement;
    if (myBrand) {
      root.style.setProperty("--brand-primary", myBrand.primaryColor);
      root.style.setProperty("--brand-secondary", myBrand.secondaryColor);
    }
  }, [myBrand]);

  // OUTBID detection with sound + haptic.
  useEffect(() => {
    const flash = state.lastOutbid;
    if (!flash || flash.flashId === lastOutbidFlashId) return;
    setLastOutbidFlashId(flash.flashId);
    if (flash.displacedBrandId === brandId) {
      setOutbidAlert(true);
      play("outbid");
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(200);
      }
      const t = setTimeout(() => setOutbidAlert(false), 3000);
      return () => clearTimeout(t);
    }
  }, [state.lastOutbid, lastOutbidFlashId, brandId, play]);

  const winningBid = state.leaderboard[0];
  const winningAmount = winningBid?.amountUsd ?? 0;
  const iAmWinning = winningBid?.brandId === brandId;
  const unlockedTier = tierForAmount(bidAmount);
  const beatAmount = Math.max(winningAmount + 1, tierMin("audio"));

  const audience = Math.max(state.listeners, 1);
  const threshold =
    state.nowPlayingAttentionThreshold ?? Math.ceil(audience * 0.6);
  const cpva = threshold > 0 ? bidAmount / threshold : 0;

  const [slotSeconds, setSlotSeconds] = useState(0);
  useEffect(() => {
    const update = () => {
      const closesAt = state.currentAuction?.closesAt;
      setSlotSeconds(
        closesAt
          ? Math.max(Math.ceil((Date.parse(closesAt) - Date.now()) / 1000), 0)
          : 0,
      );
    };
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [state.currentAuction?.closesAt]);

  const handlePlaceBid = async () => {
    if (bidAmount > balance || bidSubmitting) return;
    setBidError(null);
    setBidSubmitting(true);
    try {
      if (mode === "live") {
        if (!demoBrandToken) {
          throw new Error("Missing local demo brand token.");
        }
        const result = await placeBidLive(bidAmount, demoBrandToken);
        setBalance(result.balance.availableUsd);
      }
      play("bid");
      setBidPlaced(true);
      setTimeout(() => setBidPlaced(false), 2000);
    } catch (error) {
      setBidError(errorMessage(error));
    } finally {
      setBidSubmitting(false);
    }
  };

  return (
    <main
      className="brand-shell slop-surface-shell has-dock"
      style={styles.main}
    >
      {/* Ambient brand glow — the console breathes with the brand's identity. */}
      <AmbientGlow
        color={myBrand?.primaryColor ?? "#1e6fff"}
        secondary={myBrand?.secondaryColor ?? "#8ab4ff"}
        intensity={outbidAlert ? 1.5 : iAmWinning ? 1.2 : 0.8}
      />
      <SphereField className="sphere-field--soft brand-spheres" />
      <div className="slop-grain" />

      <div className="brand-console-frame slop-frame slop-frame--wide">
        {/* OUTBID alert — full-width, urgent */}
        <AnimatePresence>
          {outbidAlert && (
            <motion.div
              key="outbid"
              role="status"
              aria-live="assertive"
              style={styles.outbidBanner}
              initial={{ y: -60, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -60, opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
            >
              <span style={styles.outbidBolt}>⚡</span> OUTBID — you&apos;ve
              been overtaken! Raise your bid.
            </motion.div>
          )}
        </AnimatePresence>

        <SurfaceHeader
          role="03"
          subtitle="The auction cockpit"
          trailing={
            <span
              className="slop-hud-pill"
              style={{
                color:
                  mode === "demo" || connectionStatus === "connected"
                    ? "var(--slop-lime)"
                    : "var(--slop-yellow)",
              }}
            >
              <i style={styles.networkDot} />
              {mode === "demo"
                ? "Demo feed"
                : connectionStatus === "connected"
                  ? "Market live"
                  : "Market offline"}
            </span>
          }
        />

        <LoopStatus state={state} />
        <ScreenCrossLink brandId={brandId} state={state} leading={bidPlaced} />

        <FirstRunCoach
          storageKey="slopstream.coach.brand.v1"
          title="How bidding works"
          steps={[
            "Raise your bid to own the next slot",
            "Winning amount unlocks production quality",
            "You pay when verified attention clears — not for empty airtime",
          ]}
        />

        <p className="slop-value-prop">
          Bid for the next moment. You pay for verified attention — not empty
          impressions.
        </p>

        <AnimatePresence>
          {state.lastSettlement && (
            <motion.div
              key={state.lastSettlement.flashId}
              role="status"
              aria-live="polite"
              style={{
                ...styles.settlementBanner,
                borderColor:
                  state.lastSettlement.kind === "cleared"
                    ? "rgba(74,222,128,0.45)"
                    : "rgba(255,138,30,0.45)",
              }}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {state.lastSettlement.kind === "cleared"
                ? `Cleared — $${state.lastSettlement.amountUsd.toFixed(2)} paid. Listeners share $${(state.lastSettlement.listenerPoolUsd ?? 0).toFixed(2)}.`
                : state.lastSettlement.kind === "uncleared"
                  ? `Threshold missed — $${state.lastSettlement.amountUsd.toFixed(2)} returned.`
                  : `Generation failed — $${state.lastSettlement.amountUsd.toFixed(2)} returned.`}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="brand-console-grid">
          <section style={styles.overviewColumn}>
            {/* Balance + campaign — glassmorphic, floating */}
            <motion.div
              style={styles.balanceRow}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div style={styles.balanceBox}>
                <div style={styles.balanceLabel}>YOUR BALANCE</div>
                <motion.div
                  key={balance}
                  style={styles.balanceAmount}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 14 }}
                >
                  ${balance.toFixed(2)}
                </motion.div>
              </div>
              <div style={styles.campaignBox}>
                <div style={styles.balanceLabel}>ACTIVE CAMPAIGN</div>
                <div style={styles.campaignName}>{myBrand?.name ?? "—"}</div>
              </div>
            </motion.div>

            <div style={styles.statsRow}>
              <Stat
                label="CURRENT LISTENERS"
                value={state.listeners.toLocaleString()}
              />
              <Stat
                label="CURRENT SLOT"
                value={
                  state.currentAuction ? `#${state.currentAuction.slot}` : "—"
                }
              />
            </div>

            {/* World preview — a mini portal into the 3D big screen showing
            the brand's blob position in the leaderboard fluid. */}
            <WorldPreview
              leaderboard={state.leaderboard}
              brandById={state.brandById}
              myBrandId={brandId}
              myBrandColor={myBrand?.primaryColor ?? "#1e6fff"}
            />
          </section>

          <section style={styles.actionColumn}>
            {/* Bid section — the pressure station */}
            <motion.div
              className="brand-bid-sticky"
              style={{
                ...styles.bidSection,
                boxShadow: `0 8px 40px ${myBrand?.primaryColor ?? "#1e6fff"}22`,
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div style={styles.bidRow}>
                <label style={styles.bidLabel} htmlFor="brand-bid-amount">
                  YOUR BID
                </label>
                <div style={styles.bidInputWrap}>
                  <span style={styles.dollar}>$</span>
                  <input
                    id="brand-bid-amount"
                    type="number"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(Number(e.target.value))}
                    style={styles.bidInput}
                    min={1}
                  />
                </div>
              </div>

              <div style={styles.winningRow}>
                <span style={styles.bidLabel}>CURRENT WINNING BID</span>
                <motion.span
                  key={winningAmount}
                  style={{
                    ...styles.winningAmount,
                    color: iAmWinning ? "#4ade80" : "#fff",
                  }}
                  initial={{ scale: 1.4 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 16 }}
                >
                  ${winningAmount.toFixed(2)}
                  {iAmWinning && <span style={styles.youTag}> (you)</span>}
                </motion.span>
              </div>

              <div style={styles.cpvaRow}>
                <span style={styles.cpvaText}>
                  ~${cpva.toFixed(3)} / verified attention
                </span>
                <span style={styles.cpvaSub}>
                  (at {state.listeners.toLocaleString()} listeners,{" "}
                  {Math.round((threshold / audience) * 100)}% threshold)
                </span>
              </div>

              <div style={styles.countdownRow}>
                <span style={styles.countdownLabel}>⏱ slot closes in</span>
                <motion.span
                  key={slotSeconds}
                  style={{
                    ...styles.countdownValue,
                    color: slotSeconds <= 5 ? "#ff3b3b" : "#ff8a1e",
                  }}
                  initial={{ scale: 1.3 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 14 }}
                >
                  {slotSeconds}s
                </motion.span>
              </div>

              <motion.button
                style={{
                  ...styles.bidButton,
                  background:
                    bidAmount > balance
                      ? "#444"
                      : `linear-gradient(135deg, ${myBrand?.primaryColor ?? "#1e6fff"}, ${myBrand?.secondaryColor ?? "#8ab4ff"})`,
                  boxShadow:
                    bidAmount > balance
                      ? "none"
                      : `0 8px 30px ${myBrand?.primaryColor ?? "#1e6fff"}44`,
                }}
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => void handlePlaceBid()}
                disabled={bidAmount > balance || bidSubmitting}
              >
                {bidSubmitting
                  ? "PLACING BID…"
                  : bidAmount > balance
                    ? "INSUFFICIENT BALANCE"
                    : `INCREASE TO $${bidAmount}`}
              </motion.button>

              <button
                type="button"
                style={styles.beatButton}
                disabled={beatAmount > balance || bidSubmitting}
                onClick={() => {
                  setBidAmount(beatAmount);
                  void (async () => {
                    if (beatAmount > balance || bidSubmitting) return;
                    setBidError(null);
                    setBidSubmitting(true);
                    try {
                      if (mode === "live") {
                        if (!demoBrandToken) {
                          throw new Error("Missing local demo brand token.");
                        }
                        const result = await placeBidLive(
                          beatAmount,
                          demoBrandToken,
                        );
                        setBalance(result.balance.availableUsd);
                      }
                      play("bid");
                      setBidPlaced(true);
                      setTimeout(() => setBidPlaced(false), 2000);
                    } catch (error) {
                      setBidError(errorMessage(error));
                    } finally {
                      setBidSubmitting(false);
                    }
                  })();
                }}
              >
                Beat by $1 → ${beatAmount}
              </button>

              {bidError && (
                <div role="alert" style={styles.bidError}>
                  {bidError}
                </div>
              )}

              <AnimatePresence>
                {bidPlaced && (
                  <motion.div
                    style={styles.bidConfirmed}
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 18 }}
                  >
                    <BidParticleEffect
                      color={myBrand?.primaryColor ?? "#1e6fff"}
                    />
                    ✓ Bid placed — watch the leaderboard
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Production tiers — auto from bid amount */}
            <div style={styles.tierSection}>
              <div style={styles.tierLabel}>PRODUCTION TIER</div>
              <p style={styles.tierHint}>
                Your bid unlocks{" "}
                <strong style={{ color: TIER_COLORS[unlockedTier] }}>
                  {TIER_LABELS[unlockedTier]}
                </strong>
                . Tap a tier to jump to its minimum bid.
              </p>
              <div style={styles.tierGrid}>
                {(Object.keys(TIER_BID_THRESHOLDS_USD) as ProductionTier[]).map(
                  (tier) => {
                    const range = TIER_BID_THRESHOLDS_USD[tier];
                    const label = TIER_LABELS[tier];
                    const rangeText =
                      range.max === null
                        ? `$${range.min}+`
                        : `$${range.min}–$${range.max}`;
                    const isSelected = unlockedTier === tier;
                    return (
                      <motion.button
                        key={tier}
                        type="button"
                        style={{
                          ...styles.tierChip,
                          borderColor: isSelected
                            ? TIER_COLORS[tier]
                            : "rgba(255,255,255,0.12)",
                          background: isSelected
                            ? `${TIER_COLORS[tier]}22`
                            : "rgba(255,255,255,0.04)",
                          boxShadow: isSelected
                            ? `0 4px 20px ${TIER_COLORS[tier]}33`
                            : "none",
                        }}
                        whileTap={{ scale: 0.95 }}
                        whileHover={{ scale: 1.03 }}
                        onClick={() => setBidAmount(tierMin(tier))}
                      >
                        <span
                          style={{
                            ...styles.tierRange,
                            color: isSelected ? TIER_COLORS[tier] : "#fff",
                          }}
                        >
                          {rangeText}
                        </span>
                        <span style={styles.tierDesc}>{label}</span>
                      </motion.button>
                    );
                  },
                )}
              </div>
            </div>

            {/* Mini leaderboard — living, with your brand highlighted */}
            <div style={styles.miniLeaderboard}>
              <div style={styles.tierLabel}>LIVE LEADERBOARD</div>
              <AnimatePresence mode="popLayout">
                {state.leaderboard.map((entry, i) => {
                  const b = state.brandById[entry.brandId];
                  const isMe = entry.brandId === brandId;
                  return (
                    <motion.div
                      key={entry.brandId}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 22,
                      }}
                      style={{
                        ...styles.miniEntry,
                        borderLeft: `4px solid ${b?.primaryColor ?? "#888"}`,
                        background: isMe
                          ? `${myBrand?.primaryColor ?? "#1e6fff"}18`
                          : "rgba(255,255,255,0.04)",
                        boxShadow: isMe
                          ? `0 0 16px ${myBrand?.primaryColor ?? "#1e6fff"}22`
                          : "none",
                      }}
                    >
                      <span style={styles.miniRank}>#{i + 1}</span>
                      <span style={styles.miniName}>
                        {b?.name ?? entry.brandId}
                        {isMe && <span style={styles.meTag}> (you)</span>}
                      </span>
                      <motion.span
                        key={entry.amountUsd}
                        initial={{ scale: 1.3 }}
                        animate={{ scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 14,
                        }}
                        style={styles.miniAmount}
                      >
                        ${entry.amountUsd.toFixed(2)}
                      </motion.span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {state.leaderboard.length === 0 && (
                <div style={styles.miniEmpty}>The market is open.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

/** Ambient brand glow — a fixed canvas that breathes with the brand color. */
function AmbientGlow({
  color,
  secondary,
  intensity,
}: {
  color: string;
  secondary: string;
  intensity: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let phase = 0;
    let currentIntensity = intensity;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      phase += 0.015;
      currentIntensity += (intensity - currentIntensity) * 0.05;

      ctx.clearRect(0, 0, w, h);

      // Two drifting blobs — primary and secondary brand colors.
      const cx1 = w * 0.3 + Math.sin(phase) * 30;
      const cy1 = h * 0.4 + Math.cos(phase * 0.7) * 20;
      const r1 = Math.max(w, h) * 0.4 * currentIntensity;
      const grad1 = ctx.createRadialGradient(cx1, cy1, 0, cx1, cy1, r1);
      grad1.addColorStop(0, hexA(color, 0.25 * currentIntensity));
      grad1.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, w, h);

      const cx2 = w * 0.7 + Math.cos(phase * 0.9) * 25;
      const cy2 = h * 0.6 + Math.sin(phase * 1.1) * 20;
      const r2 = Math.max(w, h) * 0.35 * currentIntensity;
      const grad2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, r2);
      grad2.addColorStop(0, hexA(secondary, 0.2 * currentIntensity));
      grad2.addColorStop(1, hexA(secondary, 0));
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [color, secondary, intensity]);

  return (
    <canvas
      ref={canvasRef}
      width={560}
      height={1000}
      style={styles.glowCanvas}
    />
  );
}

/** Bid confirmation particle effect — particles flow from button upward. */
function BidParticleEffect({ color }: { color: string }) {
  return (
    <motion.div
      style={styles.particleWrap}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 1.5 }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          style={{
            ...styles.particle,
            background: color,
            boxShadow: `0 0 8px ${color}`,
            left: `${20 + i * 15}%`,
          }}
          initial={{ y: 0, opacity: 1, scale: 1 }}
          animate={{ y: -40 - i * 10, opacity: 0, scale: 0.3 }}
          transition={{ duration: 1, delay: i * 0.05, ease: "easeOut" }}
        />
      ))}
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.statBox}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

/**
 * World preview — a mini canvas that mirrors the 3D big screen's brand blob
 * field. Shows the brand's position in the leaderboard as floating orbs in
 * a fluid-like field. The #1 brand is largest and centered; others recede.
 * This is the "portal into the big screen" from Phase 8.
 */
function WorldPreview({
  leaderboard,
  brandById,
  myBrandId,
  myBrandColor,
}: {
  leaderboard: { brandId: string; amountUsd: number }[];
  brandById: Record<string, BrandSummary | undefined>;
  myBrandId: string;
  myBrandColor: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let phase = 0;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      phase += 0.015;

      // High-contrast portal backdrop.
      const backdrop = ctx.createLinearGradient(0, 0, w, h);
      backdrop.addColorStop(0, "#f4f1e8");
      backdrop.addColorStop(1, "#d8e5ff");
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, w, h);

      // Subtle fluid shimmer.
      const shimmer = ctx.createRadialGradient(
        w / 2 + Math.sin(phase) * 20,
        h / 2 + Math.cos(phase * 0.7) * 15,
        0,
        w / 2,
        h / 2,
        w * 0.6,
      );
      shimmer.addColorStop(0, hexA(myBrandColor, 0.24));
      shimmer.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = shimmer;
      ctx.fillRect(0, 0, w, h);

      // Render brand blobs — #1 is largest at center, others recede.
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) * 0.22;

      leaderboard.forEach((entry, i) => {
        const brand = brandById[entry.brandId];
        const isMe = entry.brandId === myBrandId;
        const color = brand?.primaryColor ?? "#888";
        const secColor = brand?.secondaryColor ?? color;

        // Rank 0 at center, others arranged in a receding arc.
        const rankFactor = 1 - i * 0.2;
        const r = maxR * Math.max(0.3, rankFactor);
        const angle = i === 0 ? 0 : (i * Math.PI) / 3 + phase * 0.3;
        const dist = i === 0 ? 0 : maxR * 1.5 * (0.6 + i * 0.3);
        const bx = cx + Math.cos(angle) * dist;
        const by = cy + Math.sin(angle) * dist * 0.5;

        // Glow.
        const glow = ctx.createRadialGradient(bx, by, 0, bx, by, r * 1.5);
        glow.addColorStop(0, hexA(color, isMe ? 0.5 : 0.3));
        glow.addColorStop(0.5, hexA(secColor, 0.15));
        glow.addColorStop(1, hexA(color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(bx, by, r * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Core blob — wobbly.
        ctx.fillStyle = hexA(color, isMe ? 0.85 : 0.5);
        ctx.beginPath();
        const wobble = 1 + Math.sin(phase * 2 + i) * 0.05;
        ctx.arc(bx, by, r * wobble, 0, Math.PI * 2);
        ctx.fill();

        // Highlight ring for "me".
        if (isMe) {
          ctx.strokeStyle = hexA("#fff", 0.6);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(bx, by, r * wobble + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Rank label.
        ctx.fillStyle = isMe ? "#fff" : "rgba(255,255,255,0.5)";
        ctx.font = `${isMe ? "bold " : ""}${Math.max(10, r * 0.4)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`#${i + 1}`, bx, by);
      });

      // Empty state.
      if (leaderboard.length === 0) {
        const beads = [
          [0.16, 0.28, 20, "#ff5c58"],
          [0.28, 0.7, 29, "#45a7ff"],
          [0.5, 0.35, 42, myBrandColor],
          [0.7, 0.68, 26, "#b8ff65"],
          [0.84, 0.27, 18, "#ffe45e"],
        ] as const;
        beads.forEach(([x, y, radius, color], index) => {
          const bx = w * x + Math.sin(phase + index) * 5;
          const by = h * y + Math.cos(phase * 0.8 + index) * 4;
          const bead = ctx.createRadialGradient(
            bx - radius * 0.25,
            by - radius * 0.3,
            2,
            bx,
            by,
            radius,
          );
          bead.addColorStop(0, "#fff");
          bead.addColorStop(0.18, color);
          bead.addColorStop(1, hexA(color, 0.55));
          ctx.fillStyle = bead;
          ctx.beginPath();
          ctx.arc(bx, by, radius, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = "rgba(16,16,20,0.72)";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("YOUR BRAND ENTERS HERE", cx, h - 13);
      }

      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [leaderboard, brandById, myBrandId, myBrandColor]);

  return (
    <div style={styles.worldPreviewWrap}>
      <div style={styles.tierLabel}>WORLD PREVIEW</div>
      <canvas
        ref={canvasRef}
        width={520}
        height={160}
        style={styles.worldPreviewCanvas}
      />
    </div>
  );
}

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16) || 255;
  const g = parseInt(full.slice(2, 4), 16) || 255;
  const b = parseInt(full.slice(4, 6), 16) || 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

interface BrandBalanceResponse {
  brand: BrandSummary;
  balance: { availableUsd: number };
}

interface PlaceBidResponse {
  balance: { availableUsd: number };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to place bid.";
}

async function placeBidLive(
  amountUsd: number,
  token: string,
): Promise<PlaceBidResponse> {
  return requestJson<PlaceBidResponse>(
    "/bids",
    {
      method: "POST",
      body: JSON.stringify({ amountUsd }),
    },
    token,
  );
}

const TIER_LABELS: Record<ProductionTier, string> = {
  audio: "Audio",
  audio_image: "Audio + Image",
  video: "Video",
  premium: "Premium",
};

const TIER_COLORS: Record<ProductionTier, string> = {
  audio: "#48dbfb",
  audio_image: "#feca57",
  video: "#ff6b6b",
  premium: "#ff9ff3",
};

const styles: Record<string, React.CSSProperties> = {
  main: { position: "relative", minHeight: "100svh" },
  glowCanvas: {
    position: "fixed",
    inset: 0,
    width: "100%",
    height: "100%",
    zIndex: 0,
    pointerEvents: "none",
  },
  frame: {
    position: "relative",
    zIndex: 3,
    width: "100%",
    gap: 24,
  },
  outbidBanner: {
    background: "linear-gradient(90deg, #ff3b3b, #ff8a1e)",
    color: "#fff",
    fontWeight: 800,
    padding: "14px 20px",
    borderRadius: 14,
    textAlign: "center",
    fontSize: 16,
    boxShadow: "0 8px 30px rgba(255,59,59,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  outbidBolt: { fontSize: 20 },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: {
    fontSize: 18,
    fontWeight: 900,
    color: "#fff",
    textDecoration: "none",
  },
  consoleSub: {
    marginTop: 6,
    color: "rgba(255,255,255,0.46)",
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  valueProp: {
    margin: 0,
    maxWidth: "52ch",
    color: "rgba(255,253,246,0.72)",
    fontSize: 14,
    fontWeight: 650,
    lineHeight: 1.4,
  },
  headerStatus: {
    display: "flex",
    alignItems: "flex-end",
    flexDirection: "column",
    gap: 8,
  },
  consoleLabel: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: 700,
    color: "var(--platform-text-dim)",
  },
  networkStatus: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "7px 10px",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 999,
    background: "rgba(8,8,18,0.54)",
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  networkDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "currentColor",
    boxShadow: "0 0 12px currentColor",
  },
  overviewColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minWidth: 0,
  },
  actionColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    minWidth: 0,
  },
  balanceRow: { display: "flex", gap: 12 },
  balanceBox: {
    flex: 1,
    background: "rgba(255,255,255,0.06)",
    backdropFilter: "blur(10px)",
    borderRadius: 20,
    padding: "18px 18px",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  campaignBox: {
    flex: 1,
    background: "rgba(255,255,255,0.06)",
    backdropFilter: "blur(10px)",
    borderRadius: 20,
    padding: "18px 18px",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  balanceLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: 700,
    color: "var(--platform-text-dim)",
  },
  balanceAmount: {
    fontFamily: "var(--slop-display)",
    fontSize: 38,
    fontWeight: 900,
    color: "var(--platform-accent)",
    marginTop: 4,
    fontVariantNumeric: "tabular-nums",
  },
  campaignName: { fontSize: 20, fontWeight: 800, color: "#fff", marginTop: 4 },
  statsRow: { display: "flex", gap: 12 },
  statBox: {
    flex: 1,
    background: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: "10px 14px",
  },
  statLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: 700,
    color: "var(--platform-text-dim)",
  },
  statValue: {
    fontSize: 18,
    fontWeight: 800,
    color: "#fff",
    marginTop: 2,
    fontVariantNumeric: "tabular-nums",
  },
  bidSection: {
    background: "rgba(255,255,255,0.06)",
    backdropFilter: "blur(12px)",
    borderRadius: 26,
    padding: "clamp(20px, 3vw, 32px)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    border: "1px solid rgba(255,255,255,0.1)",
  },
  bidRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bidLabel: {
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: 700,
    color: "var(--platform-text-dim)",
  },
  bidInputWrap: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "rgba(0,0,0,0.3)",
    borderRadius: 10,
    padding: "4px 12px",
  },
  dollar: { fontSize: 18, fontWeight: 800, color: "var(--platform-text-dim)" },
  bidInput: {
    background: "transparent",
    border: "none",
    color: "#fff",
    fontSize: 22,
    fontWeight: 800,
    width: 80,
    outline: "none",
    fontVariantNumeric: "tabular-nums",
  },
  winningRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  winningAmount: {
    fontSize: 22,
    fontWeight: 900,
    fontVariantNumeric: "tabular-nums",
  },
  youTag: { fontSize: 13, color: "#4ade80", fontWeight: 700 },
  cpvaRow: { display: "flex", flexDirection: "column", gap: 2 },
  cpvaText: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--platform-accent)",
    fontVariantNumeric: "tabular-nums",
  },
  cpvaSub: { fontSize: 11, color: "var(--platform-text-dim)", fontWeight: 600 },
  countdownRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  countdownLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--platform-text-dim)",
  },
  countdownValue: {
    fontSize: 20,
    fontWeight: 900,
    fontVariantNumeric: "tabular-nums",
  },
  bidButton: {
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "18px 24px",
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: 1,
    cursor: "pointer",
  },
  beatButton: {
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 999,
    padding: "12px 16px",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },
  settlementBanner: {
    padding: "12px 14px",
    border: "1px solid",
    borderRadius: 14,
    background: "rgba(8,8,18,0.72)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.35,
  },
  bidConfirmed: {
    fontSize: 14,
    fontWeight: 700,
    color: "#4ade80",
    textAlign: "center",
    position: "relative",
  },
  bidError: {
    fontSize: 13,
    color: "#ff8a8a",
    fontWeight: 700,
    textAlign: "center",
  },
  particleWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    pointerEvents: "none",
  },
  particle: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: "50%",
    bottom: 0,
  },
  tierSection: { display: "flex", flexDirection: "column", gap: 10 },
  tierLabel: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: 800,
    color: "var(--platform-text-dim)",
  },
  tierHint: {
    margin: 0,
    color: "rgba(255,253,246,0.58)",
    fontSize: 12,
    fontWeight: 650,
    lineHeight: 1.35,
  },
  tierGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  tierChip: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "16px 8px",
    borderRadius: 18,
    border: "2px solid",
    cursor: "pointer",
    color: "#fff",
  },
  tierRange: {
    fontSize: 16,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
  },
  tierDesc: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--platform-text-dim)",
  },
  miniLeaderboard: { display: "flex", flexDirection: "column", gap: 6 },
  miniEntry: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 10,
  },
  miniRank: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--platform-text-dim)",
    width: 24,
  },
  miniName: { flex: 1, fontSize: 14, fontWeight: 700, color: "#fff" },
  meTag: { fontSize: 11, color: "#4ade80", fontWeight: 600 },
  miniAmount: {
    fontSize: 16,
    fontWeight: 800,
    color: "#fff",
    fontVariantNumeric: "tabular-nums",
  },
  miniEmpty: {
    fontSize: 14,
    color: "var(--platform-text-dim)",
    padding: "8px 12px",
    fontStyle: "italic",
  },
  worldPreviewWrap: {
    background: "rgba(255,255,255,0.04)",
    borderRadius: 24,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  worldPreviewCanvas: {
    width: "100%",
    height: 120,
    borderRadius: 16,
    display: "block",
    border: "1px solid rgba(255,255,255,0.18)",
  },
};
