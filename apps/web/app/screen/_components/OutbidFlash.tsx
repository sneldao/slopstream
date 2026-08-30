"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BrandSummary } from "@slopstream/shared";
import type { OutbidFlash } from "@/lib/streamReducer";

/**
 * The OUTBID moment — the signature animation (design-language.md "The OUTBID
 * moment"). When `flash.flashId` changes:
 *  1. the screen color washes from the displaced brand's palette to the new
 *     leader's (paint flowing across, ~600ms),
 *  2. "OUTBID" text bursts in with spring overshoot, then settles,
 *  3. a splash particle ring ripples outward from the new bid amount.
 */
export function OutbidFlashOverlay({
  flash,
  brandById,
}: {
  flash: OutbidFlash | undefined;
  brandById: Record<string, BrandSummary>;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!flash) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1700);
    return () => clearTimeout(t);
  }, [flash?.flashId, flash]);

  if (!flash) return null;
  const displaced = brandById[flash.displacedBrandId];
  const next = brandById[flash.newBrandId];
  const fromColor = displaced?.primaryColor ?? "#444";
  const toColor = next?.primaryColor ?? "#888";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={flash.flashId}
          style={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Color wash: paint flows from old leader to new leader. */}
          <motion.div
            style={{
              ...styles.wash,
              background: `linear-gradient(110deg, ${fromColor} 0%, ${toColor} 100%)`,
            }}
            initial={{ clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: "inset(0 0% 0 0)" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />

          {/* Splash ring ripples outward. */}
          <motion.div
            style={{ ...styles.ring, borderColor: toColor }}
            initial={{ scale: 0.2, opacity: 0.7 }}
            animate={{ scale: 3.5, opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />

          {/* OUTBID text burst. */}
          <motion.div
            style={styles.text}
            initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 12,
              delay: 0.15,
            }}
          >
            <span style={styles.bolt}>⚡</span> OUTBID{" "}
            <span style={styles.bolt}>⚡</span>
          </motion.div>

          {/* New leader + amount. */}
          <motion.div
            style={styles.sub}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: 0.35,
              type: "spring",
              stiffness: 300,
              damping: 22,
            }}
          >
            <span style={{ color: toColor, fontWeight: 800 }}>
              {next?.name}
            </span>
            <span style={styles.amounts}>
              ${flash.prevAmountUsd.toFixed(0)} → $
              {flash.newAmountUsd.toFixed(0)}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    overflow: "hidden",
  },
  wash: {
    position: "absolute",
    inset: 0,
    opacity: 0.55,
    mixBlendMode: "screen",
  },
  ring: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: "50%",
    border: "4px solid",
    opacity: 0.6,
  },
  text: {
    position: "relative",
    fontSize: "clamp(48px, 9vw, 140px)",
    fontWeight: 900,
    letterSpacing: 6,
    color: "#fff",
    textShadow: "0 6px 40px rgba(0,0,0,0.5)",
    fontVariantNumeric: "tabular-nums",
  },
  bolt: { fontSize: "0.7em", verticalAlign: "middle" },
  sub: {
    position: "relative",
    marginTop: 18,
    fontSize: "clamp(20px, 3vw, 34px)",
    fontWeight: 700,
    color: "#fff",
    display: "flex",
    gap: 18,
    alignItems: "baseline",
    textShadow: "0 2px 16px rgba(0,0,0,0.5)",
  },
  amounts: { fontVariantNumeric: "tabular-nums", opacity: 0.9 },
};
