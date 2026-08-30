"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BrandSummary, ProductionTier } from "@slopstream/shared";
import { TIER_BID_THRESHOLDS_USD } from "@slopstream/shared";
import { useStream } from "@/lib/useStream";

/**
 * The brand bidding console — conveys live auction pressure, not form-filling
 * (design-language.md "The brand bidding console — stakes and pressure").
 *
 * Shows: balance, active campaign, current listeners, current winning bid,
 * bid controls, cost-per-verified-attention estimate, slot countdown, and
 * production tier selection. Flashes an OUTBID alert when the brand is
 * overtaken.
 *
 * In demo mode the brand is "Acme AI" (the first demo brand) and bids are
 * canned — placing a bid updates the local display. In live mode, bids are
 * POSTed to /bids as a PlaceBidCommand.
 */
export default function BrandPage() {
  const { state, mode } = useStream();

  // The brand this console represents. In demo mode, it's Acme AI.
  const MY_BRAND_ID = "brand_acme";
  const myBrand: BrandSummary | undefined = state.brandById[MY_BRAND_ID];

  // Local console state.
  const [balance, setBalance] = useState(500);
  const [bidAmount, setBidAmount] = useState(27);
  const [selectedTier, setSelectedTier] = useState<ProductionTier>("video");
  const [outbidAlert, setOutbidAlert] = useState(false);
  const [lastOutbidFlashId, setLastOutbidFlashId] = useState<
    number | undefined
  >(undefined);
  const [bidPlaced, setBidPlaced] = useState(false);

  // Set brand palette for this surface.
  useEffect(() => {
    const root = document.documentElement;
    if (myBrand) {
      root.style.setProperty("--brand-primary", myBrand.primaryColor);
      root.style.setProperty("--brand-secondary", myBrand.secondaryColor);
    }
  }, [myBrand]);

  // Detect OUTBID: when a new outbid flash arrives and our brand is displaced.
  useEffect(() => {
    const flash = state.lastOutbid;
    if (!flash || flash.flashId === lastOutbidFlashId) return;
    setLastOutbidFlashId(flash.flashId);
    if (flash.displacedBrandId === MY_BRAND_ID) {
      setOutbidAlert(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(200);
      }
      const t = setTimeout(() => setOutbidAlert(false), 3000);
      return () => clearTimeout(t);
    }
  }, [state.lastOutbid, lastOutbidFlashId, MY_BRAND_ID]);

  // Current winning bid (highest on the leaderboard).
  const winningBid = state.leaderboard[0];
  const winningAmount = winningBid?.amountUsd ?? 0;
  const iAmWinning = winningBid?.brandId === MY_BRAND_ID;

  // Cost-per-verified-attention estimate (see economics.md "Audience size is
  // slot value"). threshold ~60% of listeners.
  const threshold =
    state.nowPlayingAttentionThreshold ?? Math.ceil(state.listeners * 0.6);
  const cpva = threshold > 0 ? bidAmount / threshold : 0;

  // Slot countdown — in demo mode this is a synthetic 30s timer.
  const [slotSeconds, setSlotSeconds] = useState(23);
  useEffect(() => {
    const interval = setInterval(() => {
      setSlotSeconds((s) => (s <= 1 ? 30 : s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handlePlaceBid = () => {
    if (bidAmount > balance) return;
    if (mode === "live") {
      void placeBidLive(MY_BRAND_ID, bidAmount);
    }
    setBidPlaced(true);
    setTimeout(() => setBidPlaced(false), 2000);
  };

  return (
    <main style={styles.main}>
      <div className="slop-canvas" />

      <div style={styles.frame}>
        {/* OUTBID alert banner */}
        <AnimatePresence>
          {outbidAlert && (
            <motion.div
              key="outbid"
              style={styles.outbidBanner}
              initial={{ y: -60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              ⚡ OUTBID — you&apos;ve been overtaken! Raise your bid.
            </motion.div>
          )}
        </AnimatePresence>

        <header style={styles.header}>
          <span style={styles.logo}>SLOPSTREAM</span>
          <span style={styles.consoleLabel}>BRAND CONSOLE</span>
        </header>

        <div style={styles.balanceRow}>
          <div style={styles.balanceBox}>
            <div style={styles.balanceLabel}>YOUR BALANCE</div>
            <div style={styles.balanceAmount}>${balance.toFixed(2)}</div>
          </div>
          <div style={styles.campaignBox}>
            <div style={styles.balanceLabel}>ACTIVE CAMPAIGN</div>
            <div style={styles.campaignName}>{myBrand?.name ?? "—"}</div>
          </div>
        </div>

        <div style={styles.statsRow}>
          <Stat
            label="CURRENT LISTENERS"
            value={state.listeners.toLocaleString()}
          />
          <Stat
            label="CURRENT SLOT"
            value={`#${state.leaderboard.length > 0 ? 1 : 1}`}
          />
        </div>

        <div style={styles.bidSection}>
          <div style={styles.bidRow}>
            <span style={styles.bidLabel}>YOUR BID</span>
            <div style={styles.bidInputWrap}>
              <span style={styles.dollar}>$</span>
              <input
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
              style={styles.winningAmount}
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
              {Math.round((threshold / state.listeners) * 100)}% threshold)
            </span>
          </div>

          <div style={styles.countdownRow}>
            <span style={styles.countdownLabel}>⏱ slot closes in</span>
            <span style={styles.countdownValue}>{slotSeconds}s</span>
          </div>

          <motion.button
            style={{
              ...styles.bidButton,
              background:
                bidAmount > balance
                  ? "#666"
                  : `linear-gradient(135deg, ${myBrand?.primaryColor ?? "#1e6fff"}, ${myBrand?.secondaryColor ?? "#8ab4ff"})`,
            }}
            whileTap={{ scale: 0.97 }}
            onClick={handlePlaceBid}
            disabled={bidAmount > balance}
          >
            {bidAmount > balance
              ? "INSUFFICIENT BALANCE"
              : `INCREASE TO $${bidAmount}`}
          </motion.button>

          <AnimatePresence>
            {bidPlaced && (
              <motion.div
                style={styles.bidConfirmed}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                ✓ Bid placed — watch the leaderboard
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Production tiers */}
        <div style={styles.tierSection}>
          <div style={styles.tierLabel}>PRODUCTION TIER</div>
          <div style={styles.tierGrid}>
            {(Object.keys(TIER_BID_THRESHOLDS_USD) as ProductionTier[]).map(
              (tier) => {
                const range = TIER_BID_THRESHOLDS_USD[tier];
                const label = TIER_LABELS[tier];
                const rangeText =
                  range.max === null
                    ? `$${range.min}+`
                    : `$${range.min}–$${range.max}`;
                const isSelected = selectedTier === tier;
                return (
                  <motion.button
                    key={tier}
                    style={{
                      ...styles.tierChip,
                      borderColor: isSelected
                        ? TIER_COLORS[tier]
                        : "rgba(255,255,255,0.12)",
                      background: isSelected
                        ? `${TIER_COLORS[tier]}22`
                        : "rgba(255,255,255,0.04)",
                    }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedTier(tier)}
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

        {/* Mini leaderboard */}
        <div style={styles.miniLeaderboard}>
          <div style={styles.tierLabel}>LIVE LEADERBOARD</div>
          {state.leaderboard.map((entry, i) => {
            const b = state.brandById[entry.brandId];
            return (
              <div
                key={entry.brandId}
                style={{
                  ...styles.miniEntry,
                  borderLeft: `4px solid ${b?.primaryColor ?? "#888"}`,
                  background:
                    entry.brandId === MY_BRAND_ID
                      ? `${myBrand?.primaryColor}15`
                      : "rgba(255,255,255,0.04)",
                }}
              >
                <span style={styles.miniRank}>#{i + 1}</span>
                <span style={styles.miniName}>{b?.name ?? entry.brandId}</span>
                <span style={styles.miniAmount}>
                  ${entry.amountUsd.toFixed(2)}
                </span>
              </div>
            );
          })}
          {state.leaderboard.length === 0 && (
            <div style={styles.miniEmpty}>
              No bids yet — the market is open.
            </div>
          )}
        </div>
      </div>
    </main>
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

/** Live-mode bid placement — POSTs a PlaceBidCommand to the API. */
async function placeBidLive(brandId: string, amountUsd: number): Promise<void> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  try {
    await fetch(`${base}/bids`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, amountUsd }),
    });
  } catch {
    // Silently fail in demo — the fixture drives the visible state.
  }
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
  main: { position: "relative", minHeight: "100vh", overflow: "hidden" },
  frame: {
    position: "relative",
    zIndex: 1,
    maxWidth: 560,
    margin: "0 auto",
    padding: "20px 22px 40px",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  outbidBanner: {
    background: "linear-gradient(90deg, #ff3b3b, #ff8a1e)",
    color: "#fff",
    fontWeight: 800,
    padding: "12px 20px",
    borderRadius: 12,
    textAlign: "center",
    fontSize: 16,
    boxShadow: "0 8px 30px rgba(255,59,59,0.4)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: { fontSize: 16, fontWeight: 900, letterSpacing: 3, color: "#fff" },
  consoleLabel: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: 700,
    color: "var(--platform-text-dim)",
  },
  balanceRow: { display: "flex", gap: 12 },
  balanceBox: {
    flex: 1,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: "14px 16px",
  },
  campaignBox: {
    flex: 1,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: "14px 16px",
  },
  balanceLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: 700,
    color: "var(--platform-text-dim)",
  },
  balanceAmount: {
    fontSize: 28,
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
    borderRadius: 18,
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
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
    color: "#fff",
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
    color: "#ff8a1e",
    fontVariantNumeric: "tabular-nums",
  },
  bidButton: {
    color: "#fff",
    border: "none",
    borderRadius: 14,
    padding: "16px 20px",
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 1,
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
  },
  bidConfirmed: {
    fontSize: 14,
    fontWeight: 700,
    color: "#4ade80",
    textAlign: "center",
  },
  tierSection: { display: "flex", flexDirection: "column", gap: 10 },
  tierLabel: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: 800,
    color: "var(--platform-text-dim)",
  },
  tierGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  tierChip: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "12px 8px",
    borderRadius: 12,
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
};
