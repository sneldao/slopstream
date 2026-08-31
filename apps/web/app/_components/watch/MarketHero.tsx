"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AnimatedNumber } from "./AnimatedNumber";
import type {
  BrandSummary,
  LeaderboardEntry,
  Segment,
} from "@slopstream/shared";

/**
 * The Market Hero — the auction IS the product, so it gets the center stage.
 * Keeps the live price of attention (next-slot price), the standing top bid,
 * and the auction deadline visible at all times. The ads are the content;
 * this panel is the story (review: Thiel/PG — "make the market the hero").
 * A mini sparkline of recent cleared slot prices shows the compounding
 * price-of-attention history (review: Thiel "durability > flash").
 */
export function MarketHero({
  leaderboard,
  brandById,
  nextSlotPriceUsd,
  currentAuction,
  recentSegments,
  clearedBidExplanation,
}: {
  leaderboard: LeaderboardEntry[];
  brandById: Record<string, BrandSummary>;
  nextSlotPriceUsd: number;
  currentAuction?: { slot: number; closesAt: string };
  recentSegments: Segment[];
  clearedBidExplanation?: string;
}) {
  const leader = leaderboard[0];
  const leaderBrand = leader ? brandById[leader.brandId] : undefined;
  // Cleared price history, oldest first (recentSegments is newest first).
  const priceHistory = recentSegments
    .filter((s) => s.clearedAmountUsd !== undefined)
    .map((s) => s.clearedAmountUsd!)
    .reverse()
    .slice(-10);

  return (
    <motion.section
      style={styles.hero}
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, type: "spring", stiffness: 200, damping: 22 }}
      aria-label="Live auction — current price of the next ad slot"
    >
      <div style={styles.kicker}>LIVE PRICE OF ATTENTION</div>
      <div style={styles.row}>
        <div style={styles.priceBlock}>
          <span style={styles.price}>
            <AnimatedNumber
              value={nextSlotPriceUsd}
              format={(n) => `$${n.toFixed(0)}`}
            />
          </span>
          <span style={styles.priceLabel}>next slot</span>
        </div>
        {leader && leaderBrand && (
          <div style={styles.leaderBlock}>
            <span
              style={{
                ...styles.leaderDot,
                background: leaderBrand.primaryColor,
              }}
            />
            <span style={styles.leaderName}>{leaderBrand.name}</span>
            <span style={styles.leaderAmount}>
              ${leader.amountUsd.toFixed(0)}
            </span>
          </div>
        )}
        <AuctionCountdown closesAt={currentAuction?.closesAt} />
      </div>
      {priceHistory.length > 0 && <PriceSparkline values={priceHistory} />}
      {clearedBidExplanation && (
        <p style={styles.explanation} aria-live="polite">
          {clearedBidExplanation}
        </p>
      )}
    </motion.section>
  );
}

/** Mini bar chart of the last cleared slot prices, oldest left. */
function PriceSparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div style={styles.sparkline} aria-label="Recent cleared slot prices">
      {values.map((v, i) => (
        <div key={i} style={styles.sparklineCol} title={`$${v.toFixed(0)}`}>
          <div
            style={{
              ...styles.sparklineBar,
              height: `${Math.max(8, (v / max) * 100)}%`,
              opacity: i === values.length - 1 ? 1 : 0.45,
            }}
          />
        </div>
      ))}
      <span style={styles.sparklineLabel}>last {values.length} cleared</span>
    </div>
  );
}

/** Server-authoritative deadline, ticking client-side. Hides when expired. */
function AuctionCountdown({ closesAt }: { closesAt?: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!closesAt) {
      setRemaining(null);
      return;
    }
    const target = new Date(closesAt).getTime();
    const tick = () =>
      setRemaining(Math.max(0, Math.round((target - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [closesAt]);

  if (remaining === null || remaining <= 0) return null;
  return (
    <div style={styles.countdown} role="timer">
      <span style={styles.countdownDot} aria-hidden />
      closes in {remaining}s
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  hero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "10px 24px 12px",
    borderRadius: 18,
    background: "rgba(244,241,232,0.92)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(16,16,20,0.22)",
    boxShadow: "5px 6px 0 rgba(16,16,20,0.16)",
  },
  kicker: {
    fontSize: 10,
    letterSpacing: 3,
    fontWeight: 900,
    color: "rgba(16,16,20,0.58)",
    textTransform: "uppercase",
  },
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: "clamp(14px, 1.8vw, 26px)",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  priceBlock: { display: "flex", alignItems: "baseline", gap: 8 },
  price: {
    fontSize: "clamp(30px, 4vw, 48px)",
    fontWeight: 900,
    color: "var(--slop-ink)",
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  priceLabel: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: 800,
    textTransform: "uppercase",
    color: "rgba(16,16,20,0.55)",
  },
  leaderBlock: { display: "flex", alignItems: "baseline", gap: 8 },
  leaderDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    alignSelf: "center",
    boxShadow: "0 0 12px currentColor",
  },
  leaderName: { fontSize: 15, fontWeight: 800, color: "var(--slop-ink)" },
  leaderAmount: {
    fontSize: 18,
    fontWeight: 900,
    color: "var(--slop-ink)",
    fontVariantNumeric: "tabular-nums",
  },
  countdown: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(16,16,20,0.66)",
  },
  countdownDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ff3b3b",
    boxShadow: "0 0 10px #ff3b3b",
    animation: "slop-breathe 1.4s ease-in-out infinite",
  },
  sparkline: {
    display: "flex",
    alignItems: "flex-end",
    gap: 3,
    height: 34,
    marginTop: 6,
    padding: "0 2px",
  },
  sparklineCol: {
    width: 14,
    height: "100%",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  sparklineBar: {
    width: 10,
    minHeight: 4,
    borderRadius: "3px 3px 0 0",
    background: "var(--slop-yellow)",
  },
  explanation: {
    maxWidth: "58ch",
    margin: "8px 0 0",
    color: "rgba(16,16,20,0.64)",
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.35,
    textAlign: "center",
  },
  sparklineLabel: {
    marginLeft: 8,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(16,16,20,0.45)",
    alignSelf: "flex-end",
    whiteSpace: "nowrap",
  },
};
