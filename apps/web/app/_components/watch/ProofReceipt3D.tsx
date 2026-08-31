"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ClearBurst } from "@/lib/streamReducer";

interface ProofReceipt3DProps {
  burst: ClearBurst | undefined;
  brandName: string | undefined;
  brandColor: string | undefined;
}

interface ReceiptData {
  burstId: number;
  grossAmountUsd: number;
  listenerPoolUsd: number;
  platformRevenueUsd: number;
  explanation?: string;
}

/**
 * The proof receipt — the one still moment in the slop. A glass card that
 * condenses from the center of the 3D chaos when a bid clears. The fluid
 * continues to swirl around it (the 3D canvas is behind), but the card is
 * perfectly still, perfectly sharp.
 *
 * This is an HTML overlay with `backdrop-filter: blur` — it punches a calm
 * circle in the fluid. The card shows:
 * - "ATTENTION VERIFIED" stamp effect (rotating seal)
 * - Gross cleared amount
 * - 80% → listener reward pool (brand-colored)
 * - 20% → Slopstream (neutral)
 * - "VERIFIED" footer
 *
 * The card holds for ~3.5s, then fades out as the stream continues.
 * Triggered by `burst.burstId` changing.
 *
 * This is the screenshot that wins.
 */
export function ProofReceipt3D({
  burst,
  brandName,
  brandColor,
}: ProofReceipt3DProps) {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const lastBurstId = useRef(0);

  useEffect(() => {
    if (burst && burst.burstId !== lastBurstId.current && burst.burstId > 0) {
      lastBurstId.current = burst.burstId;
      setReceipt({
        burstId: burst.burstId,
        grossAmountUsd: burst.grossAmountUsd,
        listenerPoolUsd: burst.listenerPoolUsd,
        platformRevenueUsd: burst.platformRevenueUsd,
        explanation: burst.explanation,
      });
    }
  }, [burst]);

  return (
    <AnimatePresence mode="wait">
      {receipt && (
        <motion.div
          key={receipt.burstId}
          style={styles.overlay}
          initial={{ opacity: 0, scale: 0.7, filter: "blur(20px)" }}
          animate={{
            opacity: 1,
            scale: 1,
            filter: "blur(0px)",
          }}
          exit={{ opacity: 0, scale: 1.1, filter: "blur(12px)" }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 22,
            filter: { duration: 0.4 },
          }}
          onAnimationComplete={() => {
            // Auto-dismiss after hold.
            const timer = setTimeout(() => setReceipt(null), 3500);
            return () => clearTimeout(timer);
          }}
        >
          <div style={styles.card}>
            {/* Stamp seal — rotates and stamps in. */}
            <motion.div
              style={styles.seal}
              initial={{ rotate: -45, scale: 0, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{
                delay: 0.3,
                type: "spring",
                stiffness: 300,
                damping: 12,
              }}
            >
              <div style={styles.sealInner}>✓</div>
              <div style={styles.sealText}>VERIFIED</div>
            </motion.div>

            <div style={styles.header}>ATTENTION VERIFIED</div>

            {brandName && (
              <div style={{ ...styles.brand, color: brandColor ?? "#fff" }}>
                {brandName}
              </div>
            )}

            <motion.div
              style={styles.amount}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <CountUp value={receipt.grossAmountUsd} prefix="$" />
              <span style={styles.amountLabel}>cleared</span>
            </motion.div>

            <motion.div
              style={styles.split}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <div style={styles.splitRow}>
                <span
                  style={{
                    ...styles.splitDot,
                    background: brandColor ?? "#fff",
                  }}
                />
                <span style={styles.splitLabel}>Listener rewards</span>
                <span style={styles.splitAmount}>
                  <CountUp value={receipt.listenerPoolUsd} prefix="$" />
                </span>
              </div>
              <div style={styles.splitRow}>
                <span style={{ ...styles.splitDot, background: "#ffd76a" }} />
                <span style={styles.splitLabel}>Slopstream</span>
                <span style={styles.splitAmount}>
                  <CountUp value={receipt.platformRevenueUsd} prefix="$" />
                </span>
              </div>
            </motion.div>

            {receipt.explanation && (
              <motion.div
                style={styles.explanation}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.95 }}
              >
                {receipt.explanation}
              </motion.div>
            )}

            <motion.div
              style={styles.footer}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
            >
              VERIFIED · DEMO MODE
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CountUp({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(0);

  useEffect(() => {
    const start = ref.current;
    const duration = 800;
    const startTime = performance.now();
    let raf = 0;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      // Ease-out cubic.
      const eased = 1 - Math.pow(1 - t, 3);
      const current = start + (value - start) * eased;
      setDisplay(current);
      ref.current = current;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span>
      {prefix}
      {display.toFixed(2)}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 50,
    pointerEvents: "none",
  },
  card: {
    background: "rgba(10, 10, 26, 0.65)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255, 255, 255, 0.18)",
    borderRadius: 24,
    padding: "32px 40px",
    textAlign: "center",
    boxShadow:
      "0 30px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(255, 255, 255, 0.05)",
    minWidth: 320,
  },
  seal: {
    width: 64,
    height: 64,
    margin: "0 auto 16px",
    borderRadius: "50%",
    border: "3px solid rgba(255, 255, 255, 0.6)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 20px rgba(255, 255, 255, 0.15)",
  },
  sealInner: {
    fontSize: 28,
    fontWeight: 900,
    color: "#fff",
    lineHeight: 1,
  },
  sealText: {
    fontSize: 7,
    fontWeight: 800,
    letterSpacing: 1,
    color: "rgba(255, 255, 255, 0.7)",
    marginTop: 2,
  },
  header: {
    fontSize: 14,
    letterSpacing: 4,
    fontWeight: 800,
    color: "rgba(255, 255, 255, 0.9)",
    marginBottom: 8,
  },
  brand: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 12,
  },
  amount: {
    fontSize: 42,
    fontWeight: 900,
    color: "#fff",
    display: "flex",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 8,
  },
  amountLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(255, 255, 255, 0.5)",
    letterSpacing: 1,
  },
  split: {
    marginTop: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  splitRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    fontWeight: 600,
  },
  splitDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },
  splitLabel: {
    color: "rgba(255, 255, 255, 0.7)",
    flex: 1,
    textAlign: "left",
  },
  splitAmount: {
    color: "#fff",
    fontVariantNumeric: "tabular-nums",
  },
  explanation: {
    maxWidth: 360,
    marginTop: 14,
    color: "rgba(255, 255, 255, 0.66)",
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.35,
  },
  footer: {
    marginTop: 20,
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: 700,
    color: "rgba(255, 255, 255, 0.35)",
  },
};
