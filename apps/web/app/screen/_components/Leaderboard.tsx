"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { BrandSummary, LeaderboardEntry } from "@slopstream/shared";

/**
 * The leaderboard as floating, semi-transparent chips that bob with subtle
 * physics and re-sort with a spring shuffle (not an instant snap). See
 * design-language.md "The leaderboard as floating chips".
 */
export function Leaderboard({
  ranking,
  brandById,
  nextSlotPriceUsd,
}: {
  ranking: LeaderboardEntry[];
  brandById: Record<string, BrandSummary>;
  nextSlotPriceUsd: number;
}) {
  return (
    <div style={styles.column}>
      <div style={styles.header}>
        <span style={styles.liveDot} />
        <span style={styles.headerText}>LIVE ATTENTION MARKET</span>
      </div>

      <div style={styles.chips}>
        <AnimatePresence mode="popLayout">
          {ranking.map((entry, i) => {
            const brand = brandById[entry.brandId];
            const primary = brand?.primaryColor ?? "#888";
            const secondary = brand?.secondaryColor ?? "#444";
            return (
              <motion.div
                key={entry.brandId}
                layout
                initial={{ opacity: 0, scale: 0.6, y: -20 }}
                animate={{
                  opacity: 1,
                  scale: i === 0 ? 1.06 : 1,
                  y: 0,
                }}
                exit={{ opacity: 0, scale: 0.6, y: 30 }}
                transition={{ type: "spring", stiffness: 320, damping: 24 }}
                style={{
                  ...styles.chip,
                  background: `linear-gradient(135deg, ${hexA(primary, 0.92)}, ${hexA(secondary, 0.82)})`,
                  boxShadow: `0 10px 40px ${hexA(primary, 0.45)}, inset 0 1px 0 ${hexA("#ffffff", 0.25)}`,
                  animation: `slop-float ${4 + i * 0.6}s ease-in-out infinite`,
                }}
              >
                <span style={styles.rank}>#{i + 1}</span>
                <span style={styles.brandName}>
                  {brand?.name ?? entry.brandId}
                </span>
                <motion.span
                  key={entry.amountUsd}
                  initial={{ scale: 1.4, color: "#fff" }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                  style={styles.amount}
                >
                  ${entry.amountUsd.toFixed(2)}
                </motion.span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div style={styles.nextSlot}>
        <span style={styles.nextSlotLabel}>NEXT SLOT</span>
        <AnimatedAmount value={nextSlotPriceUsd} />
      </div>
    </div>
  );
}

function AnimatedAmount({ value }: { value: number }) {
  return (
    <motion.span
      key={value}
      initial={{ scale: 1.3 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 16 }}
      style={styles.nextSlotPrice}
    >
      ${value.toFixed(2)}
    </motion.span>
  );
}

/** hex + alpha -> rgba string (tolerates #rgb / #rrggbb). */
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const styles: Record<string, React.CSSProperties> = {
  column: { display: "flex", flexDirection: "column", gap: 14 },
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#ff3b3b",
    boxShadow: "0 0 12px #ff3b3b",
    animation: "slop-breathe 1.4s ease-in-out infinite",
  },
  headerText: {
    fontWeight: 800,
    letterSpacing: 2,
    fontSize: 15,
    color: "var(--platform-text-dim)",
  },
  chips: { display: "flex", flexDirection: "column", gap: 10 },
  chip: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 18px",
    borderRadius: 16,
    color: "#fff",
    fontWeight: 700,
    backdropFilter: "blur(6px)",
  },
  rank: { fontSize: 13, opacity: 0.7, fontVariantNumeric: "tabular-nums" },
  brandName: {
    flex: 1,
    fontSize: 20,
    textShadow: "0 1px 8px rgba(0,0,0,0.35)",
  },
  amount: { fontSize: 22, fontVariantNumeric: "tabular-nums", fontWeight: 800 },
  nextSlot: { display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 },
  nextSlotLabel: {
    fontSize: 12,
    letterSpacing: 2,
    color: "var(--platform-text-dim)",
  },
  nextSlotPrice: {
    fontSize: 20,
    fontWeight: 800,
    color: "var(--platform-accent)",
  },
};
