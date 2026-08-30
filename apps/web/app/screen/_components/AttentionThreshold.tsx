"use client";

import { motion } from "framer-motion";
import type { AttentionState } from "@/lib/streamReducer";

/**
 * The attention threshold as a liquid filling up — not a striped progress
 * bar (design-language.md "The attention threshold as liquid"). The verified
 * count rises, the liquid level rises, and it glows when the threshold is met.
 */
export function AttentionThreshold({
  attention,
}: {
  attention: AttentionState | undefined;
}) {
  if (!attention) return null;
  const { verifiedCount, total, threshold } = attention;
  // Fill is relative to the threshold (100% = cleared). Cap at 1.
  const fill = threshold > 0 ? Math.min(verifiedCount / threshold, 1) : 0;
  const cleared = verifiedCount >= threshold;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div style={styles.wrap}>
      <div style={styles.labelRow}>
        <span style={styles.label}>
          {cleared ? "✓ THRESHOLD MET" : "ATTENTION WINDOW"}
        </span>
        <span style={styles.count}>
          <span className="slop-figures">{verifiedCount}</span>
          <span style={styles.dim}> / </span>
          <span className="slop-figures" style={styles.dim}>
            {threshold}
          </span>
          <span style={styles.dim}> verified</span>
        </span>
      </div>

      <div style={styles.tube}>
        <motion.div
          style={{
            ...styles.liquid,
            background: cleared
              ? `linear-gradient(180deg, var(--threshold-bright), var(--threshold-warm))`
              : `linear-gradient(180deg, var(--threshold-warm), #c85a1f)`,
            boxShadow: cleared ? "0 0 30px var(--threshold-bright)" : "none",
          }}
          initial={false}
          animate={{ height: pct(fill) }}
          transition={{ type: "spring", stiffness: 90, damping: 18 }}
        />
        {/* Threshold marker line. */}
        <div style={styles.marker} />
        {/* Slosh highlight. */}
        <motion.div
          style={styles.slosh}
          animate={{ x: ["-30%", "30%", "-30%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div style={styles.totalRow}>
        <span style={styles.dim}>
          <span className="slop-figures">{total}</span> listeners in window
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 8, width: "100%" },
  labelRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  label: {
    fontSize: 13,
    letterSpacing: 2,
    fontWeight: 800,
    color: "var(--platform-text-dim)",
  },
  count: { fontSize: 22, fontWeight: 800 },
  dim: { color: "var(--platform-text-dim)", fontWeight: 600 },
  tube: {
    position: "relative",
    height: 26,
    borderRadius: 13,
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  liquid: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: "100%",
    borderRadius: 13,
  },
  marker: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 2,
    background: "rgba(255,255,255,0.4)",
    zIndex: 2,
  },
  slosh: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "60%",
    height: "100%",
    background:
      "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)",
    zIndex: 1,
  },
  totalRow: { display: "flex", justifyContent: "flex-end", fontSize: 12 },
};
