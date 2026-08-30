"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BrandSummary } from "@slopstream/shared";
import type { ClearBurst } from "@/lib/streamReducer";

/**
 * The clearing animation (design-language.md "The clearing animation"). When
 * `burst.burstId` changes: the full bid amount appears as a glowing number,
 * then splits into two particle streams — 80% toward LISTENER REWARD POOL
 * (in the brand's color), 20% toward SLOPSTREAM (platform accent).
 */
export function ClearBurst({
  burst,
  brand,
}: {
  burst: ClearBurst | undefined;
  brand: BrandSummary | undefined;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!burst) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2600);
    return () => clearTimeout(t);
  }, [burst?.burstId, burst]);

  if (!burst) return null;
  const brandColor = brand?.primaryColor ?? "#ffd76a";
  const platformColor = "var(--platform-accent)";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={burst.burstId}
          style={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            style={styles.gross}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 16 }}
          >
            ${burst.grossAmountUsd.toFixed(2)} CLEARED
          </motion.div>

          <div style={styles.split}>
            <Stream
              label="LISTENER REWARD POOL"
              amount={burst.listenerPoolUsd}
              color={brandColor}
              delay={0.4}
            />
            <Stream
              label="SLOPSTREAM"
              amount={burst.platformRevenueUsd}
              color={platformColor}
              delay={0.55}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Stream({
  label,
  amount,
  color,
  delay,
}: {
  label: string;
  amount: number;
  color: string;
  delay: number;
}) {
  return (
    <div style={styles.streamCol}>
      <motion.div
        style={{
          ...styles.particle,
          background: color,
          boxShadow: `0 0 20px ${color}`,
        }}
        initial={{ y: -40, opacity: 0, scale: 0.3 }}
        animate={{ y: 0, opacity: [0, 1, 1, 0.9], scale: 1 }}
        transition={{ delay, duration: 0.9, ease: "easeOut" }}
      />
      <motion.div
        style={{ ...styles.streamAmount, color }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: delay + 0.3,
          type: "spring",
          stiffness: 300,
          damping: 20,
        }}
      >
        ${amount.toFixed(2)}
      </motion.div>
      <div style={styles.streamLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    zIndex: 40,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    gap: 28,
  },
  gross: {
    fontSize: "clamp(40px, 7vw, 96px)",
    fontWeight: 900,
    letterSpacing: 4,
    color: "#fff",
    textShadow: "0 4px 30px rgba(255,224,102,0.6)",
    fontVariantNumeric: "tabular-nums",
  },
  split: {
    display: "flex",
    gap: "clamp(40px, 8vw, 120px)",
    alignItems: "flex-start",
  },
  streamCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  particle: { width: 16, height: 16, borderRadius: "50%" },
  streamAmount: {
    fontSize: "clamp(28px, 4vw, 52px)",
    fontWeight: 900,
    fontVariantNumeric: "tabular-nums",
  },
  streamLabel: {
    fontSize: 12,
    letterSpacing: 2,
    color: "var(--platform-text-dim)",
    fontWeight: 700,
  },
};
