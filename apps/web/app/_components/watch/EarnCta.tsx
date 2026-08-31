"use client";

import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";

/**
 * Earn CTA — the join panel promoted to a first-class call to action.
 * The screen used to say "LISTEN" while the product's actual pitch is
 * "earn": verified viewers get paid from every cleared bid. In idle state
 * (or when a proof is open) it renders as a larger hero CTA
 * (review: the QR is the homepage).
 */
export function EarnCta({
  listenerUrl,
  idleRecruit,
  activeChallenge = false,
  theater = false,
}: {
  listenerUrl: string | null;
  idleRecruit: boolean;
  activeChallenge?: boolean;
  theater?: boolean;
}) {
  const big = idleRecruit || activeChallenge;
  const title = activeChallenge
    ? "PROOF OPEN"
    : idleRecruit
      ? "SCAN TO EARN"
      : "LISTEN";
  const copy = activeChallenge
    ? "Prove you watched to claim your reward."
    : idleRecruit
      ? "Verified views pay. Scan, watch, get paid from every cleared bid."
      : "Watch & prove to earn from cleared bids.";
  const size = big ? 108 : 82;

  return (
    <motion.aside
      className={`screen-join${big ? " slop-join-pulse" : ""}${theater ? " screen-join--theater" : ""}`}
      style={{
        ...styles.joinPanel,
        padding: big ? 14 : 10,
        boxShadow: big
          ? "6px 7px 0 rgba(16,16,20,0.18)"
          : "5px 6px 0 rgba(16,16,20,0.16)",
      }}
      aria-label="Join Slopstream as a listener"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, type: "spring", stiffness: 200, damping: 22 }}
    >
      <div style={styles.qrFrame}>
        {listenerUrl ? (
          <QRCodeSVG
            value={listenerUrl}
            size={size}
            bgColor="#ffffff"
            fgColor="#0b0b1a"
            level="M"
            title="Listener join QR code"
          />
        ) : (
          // Hold the space until the real join URL resolves client-side.
          <span aria-hidden style={{ width: size, height: size }} />
        )}
      </div>
      <div style={styles.textCol}>
        <div style={{ ...styles.title, fontSize: big ? 15 : 12 }}>{title}</div>
        <div style={{ ...styles.sub, maxWidth: big ? 190 : 130 }}>{copy}</div>
      </div>
    </motion.aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  joinPanel: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    background: "rgba(244,241,232,0.94)",
    border: "1px solid rgba(16,16,20,0.24)",
  },
  qrFrame: {
    display: "flex",
    padding: 6,
    borderRadius: 8,
    background: "#fff",
  },
  textCol: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  title: {
    fontWeight: 900,
    letterSpacing: 2,
    color: "var(--slop-ink)",
  },
  sub: {
    fontSize: 12,
    lineHeight: 1.35,
    color: "rgba(16,16,20,0.62)",
  },
};
