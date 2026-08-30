"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AttentionProofReceipt, BrandSummary } from "@slopstream/shared";

/**
 * The proof receipt — the one calm moment in the slop (design-language.md
 * "The proof receipt — the calm center"). A translucent card that floats
 * above the chaos. This is the signature artifact judges will screenshot.
 *
 * Animation sequence:
 *  1. Card fades in with a slight scale-up spring.
 *  2. A result-specific stamp effect — verified or rejected.
 *  3. Proof hash types in character by character.
 *  4. Estimated reward amount counts up for a verified proof.
 *  5. Verifier provenance appears with a faint glow.
 *  6. Card holds for 3s, then fades out.
 */
export function ProofReceipt({
  receipt,
  brand,
  onDismiss,
}: {
  receipt: AttentionProofReceipt;
  brand: BrandSummary | undefined;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(true);
  const [typedHash, setTypedHash] = useState("");
  const [reward, setReward] = useState(0);
  const isVerified = receipt.verified;
  const verifierLabel =
    receipt.verifierMode === "midnight"
      ? "VERIFIED BY MIDNIGHT"
      : receipt.verifierMode === "stub"
        ? "VERIFIED IN DEMO MODE"
        : "VERIFIER PROVENANCE UNAVAILABLE";

  // Proof hash types in character by character.
  useEffect(() => {
    const hash = receipt.proofId.replace(/^0x/, "").slice(0, 8).toUpperCase();
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setTypedHash(`0x${hash.slice(0, i)}`);
      if (i >= hash.length) clearInterval(interval);
    }, 80);
    return () => clearInterval(interval);
  }, [receipt.proofId]);

  // Reward counts up from $0.00.
  useEffect(() => {
    if (!receipt.estimatedRewardUsd) return;
    const target = receipt.estimatedRewardUsd;
    let frame = 0;
    const totalFrames = 30;
    const animate = () => {
      frame += 1;
      const progress = Math.min(frame / totalFrames, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setReward(target * eased);
      if (frame < totalFrames) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [receipt.estimatedRewardUsd]);

  // Auto-dismiss after 3.5s.
  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 400);
    }, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          style={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label={
            isVerified ? "Attention verified" : "Attention not verified"
          }
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            style={styles.card}
            initial={{ scale: 0.7, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: -20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 20 }}
          >
            {/* Seal stamp */}
            <motion.div
              style={{
                ...styles.seal,
                background: isVerified
                  ? "linear-gradient(135deg, #4ade80, #22c55e)"
                  : "linear-gradient(135deg, #fb7185, #ef4444)",
                boxShadow: isVerified
                  ? "0 8px 24px rgba(34,197,94,0.5)"
                  : "0 8px 24px rgba(239,68,68,0.45)",
              }}
              initial={{ scale: 0, rotate: -45, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 12,
                delay: 0.2,
              }}
            >
              <motion.div
                style={styles.sealInner}
                animate={{ rotate: [0, 5, 0] }}
                transition={{ duration: 0.4, delay: 0.3 }}
              >
                {isVerified ? "✓" : "×"}
              </motion.div>
            </motion.div>

            <div style={styles.verified}>
              {isVerified ? "ATTENTION VERIFIED" : "ATTENTION NOT VERIFIED"}
            </div>

            <div style={styles.brand}>{brand?.name ?? receipt.brandId}</div>
            <div style={styles.segment}>Segment {receipt.segmentId}</div>

            <div style={styles.row}>
              <span style={styles.rowLabel}>Challenge</span>
              <span style={styles.rowValue}>
                {receipt.challengeType.toUpperCase()}
              </span>
            </div>
            <div style={styles.row}>
              <span style={styles.rowLabel}>Result</span>
              <span
                style={{
                  ...styles.rowValue,
                  color: isVerified ? "#4ade80" : "#ef4444",
                }}
              >
                {isVerified ? "VALID" : "NOT VERIFIED"}
              </span>
            </div>

            <div style={styles.divider} />

            <div style={styles.row}>
              <span style={styles.rowLabel}>Listener</span>
              <span style={styles.rowValue}>PRIVATE</span>
            </div>
            <div style={styles.row}>
              <span style={styles.rowLabel}>Session</span>
              <span style={styles.rowValue}>PRIVATE</span>
            </div>

            <div style={styles.divider} />

            <div style={styles.proofRow}>
              <span style={styles.rowLabel}>Proof</span>
              <span style={styles.proofHash} title={receipt.proofId}>
                {typedHash}
                <span style={styles.cursor}>…</span>
              </span>
            </div>
            <div style={styles.fullProofId}>{receipt.proofId}</div>

            {isVerified && (
              <div style={styles.rewardBox}>
                <div style={styles.rewardLabel}>ESTIMATED REWARD</div>
                <div style={styles.rewardAmount}>
                  ~${reward.toFixed(2)}
                  <span style={styles.rewardPending}>
                    {" "}
                    (pending pool close)
                  </span>
                </div>
              </div>
            )}

            <motion.div
              style={styles.verifiedBy}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
            >
              {verifierLabel}
            </motion.div>
            <button style={styles.closeButton} onClick={onDismiss}>
              Close receipt
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.4)",
    backdropFilter: "blur(4px)",
  },
  card: {
    background: "rgba(255,255,255,0.95)",
    color: "#0a0a1a",
    borderRadius: 20,
    padding: "28px 24px 20px",
    width: "min(360px, 90vw)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.2)",
    position: "relative",
  },
  seal: {
    position: "absolute",
    top: -22,
    right: -12,
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #4ade80, #22c55e)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 24px rgba(34,197,94,0.5)",
  },
  sealInner: { fontSize: 28, fontWeight: 900, color: "#fff" },
  verified: { fontSize: 18, fontWeight: 900, letterSpacing: 3, marginTop: 8 },
  brand: { fontSize: 22, fontWeight: 800, marginTop: 8 },
  segment: { fontSize: 13, color: "#666", marginBottom: 12 },
  row: {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    padding: "4px 0",
  },
  rowLabel: { fontSize: 13, color: "#888", fontWeight: 600 },
  rowValue: {
    fontSize: 13,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
  },
  divider: {
    width: "100%",
    height: 1,
    background: "rgba(0,0,0,0.08)",
    margin: "6px 0",
  },
  proofRow: {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    padding: "4px 0",
    alignItems: "center",
  },
  proofHash: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    fontWeight: 700,
    color: "#333",
  },
  fullProofId: {
    width: "100%",
    color: "#555",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 10,
    lineHeight: 1.4,
    overflowWrap: "anywhere",
    userSelect: "text",
  },
  cursor: { opacity: 0.4 },
  rewardBox: {
    width: "100%",
    background: "rgba(0,0,0,0.04)",
    borderRadius: 12,
    padding: "12px 16px",
    marginTop: 12,
    textAlign: "center",
  },
  rewardLabel: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: 800,
    color: "#888",
  },
  rewardAmount: {
    fontSize: 24,
    fontWeight: 900,
    marginTop: 4,
    fontVariantNumeric: "tabular-nums",
  },
  rewardPending: { fontSize: 11, fontWeight: 600, color: "#888" },
  verifiedBy: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: 800,
    color: "#6366f1",
    marginTop: 14,
    textShadow: "0 0 12px rgba(99,102,241,0.4)",
  },
  closeButton: {
    marginTop: 8,
    border: 0,
    borderRadius: 999,
    padding: "8px 14px",
    background: "rgba(0,0,0,0.08)",
    color: "#222",
    fontWeight: 700,
    cursor: "pointer",
  },
};
