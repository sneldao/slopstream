"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PublicChallenge } from "@slopstream/shared";

const OPTION_COLORS = ["#ffe45e", "#45a7ff", "#ff7a66", "#b8ff65"];

/**
 * The challenge card — pops in with spring overshoot, haptic vibration, and a
 * countdown timer (design-language.md "Challenge appearance"). Large colorful
 * tappable buttons, not radio inputs. The listener taps an option to submit.
 *
 * Phase 8 refinement: subtle 3D parallax tilt on pointer move — the card
 * feels like it floats in space, matching the 3D big screen's depth.
 */
export function ChallengeCard({
  challenge,
  brandColor,
  onAnswer,
}: {
  challenge: PublicChallenge;
  brandColor: string;
  onAnswer: (answer: string) => void;
}) {
  const [remaining, setRemaining] = useState(
    challenge.validUntil - challenge.validFrom,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const windowSec = challenge.validUntil - challenge.validFrom;
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  // Parallax tilt — track pointer over the card and tilt up to ±6°.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const handleMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      setTilt({ rx: -py * 6, ry: px * 6 });
    };
    const handleLeave = () => setTilt({ rx: 0, ry: 0 });
    el.addEventListener("pointermove", handleMove);
    el.addEventListener("pointerleave", handleLeave);
    return () => {
      el.removeEventListener("pointermove", handleMove);
      el.removeEventListener("pointerleave", handleLeave);
    };
  }, []);

  // Countdown timer — drives the timer ring depleting visibly.
  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const left = Math.max(windowSec - elapsed, 0);
      setRemaining(left);
      if (left <= 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [windowSec]);

  const ringPct = windowSec > 0 ? remaining / windowSec : 0;
  const expired = remaining <= 0;

  const handleSelect = (option: string) => {
    if (selected || expired) return;
    setSelected(option);
    // Haptic vibration if supported.
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(50);
    }
    onAnswer(option);
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={cardRef}
        style={{
          ...styles.card,
          transform: `perspective(800px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transformStyle: "preserve-3d",
        }}
        initial={{ scale: 0.5, y: 60, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.8, y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 18 }}
      >
        <div style={styles.header}>
          <span style={styles.headerText}>
            <i style={{ ...styles.headerDot, background: brandColor }} /> Live
            attention check
          </span>
          <TimerRing pct={ringPct} remaining={remaining} />
        </div>

        <div style={styles.question}>{challenge.question}</div>

        {challenge.options && (
          <div style={styles.options}>
            {challenge.options.map((opt, i) => (
              <motion.button
                key={opt}
                style={{
                  ...styles.option,
                  borderColor:
                    selected === opt ? "#101014" : "rgba(16,16,20,0.18)",
                  background:
                    selected === opt
                      ? brandColor
                      : OPTION_COLORS[i % OPTION_COLORS.length],
                }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSelect(opt)}
                disabled={!!selected || expired}
              >
                <span style={styles.optionLetter}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span style={styles.optionText}>{opt}</span>
                {selected === opt && <span style={styles.optionCheck}>✓</span>}
              </motion.button>
            ))}
          </div>
        )}

        {expired && !selected && (
          <div style={styles.expired}>
            Time&apos;s up — better luck next time.
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function TimerRing({ pct, remaining }: { pct: number; remaining: number }) {
  const size = 36;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const color = pct > 0.5 ? "#4ade80" : pct > 0.25 ? "#fbbf24" : "#ef4444";

  return (
    <div style={styles.timerWrap}>
      <svg width={size} height={size} style={styles.timerSvg}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(16,16,20,0.12)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: "stroke-dashoffset 100ms linear, stroke 300ms ease",
          }}
        />
      </svg>
      <span style={styles.timerText}>{Math.ceil(remaining)}s</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--slop-cream)",
    color: "var(--slop-ink)",
    border: "2px solid var(--slop-ink)",
    borderRadius: 28,
    padding: "22px 20px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    boxShadow: "8px 10px 0 rgba(16,16,20,0.72), 0 24px 60px rgba(0,0,0,0.42)",
    transition: "box-shadow 200ms ease",
    willChange: "transform",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerText: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    boxShadow: "0 0 12px currentColor",
  },
  question: {
    fontFamily: "var(--slop-display)",
    fontSize: 25,
    fontWeight: 900,
    color: "var(--slop-ink)",
    lineHeight: 1.05,
  },
  options: { display: "flex", flexDirection: "column", gap: 8 },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    padding: "14px 16px",
    borderRadius: 999,
    border: "1px solid",
    color: "var(--slop-ink)",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 16,
    fontWeight: 750,
    boxShadow: "0 5px 0 rgba(16,16,20,0.2)",
    transition: "background 150ms ease, transform 150ms ease",
  },
  optionLetter: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 800,
    flexShrink: 0,
  },
  optionText: { flex: 1 },
  optionCheck: { fontSize: 18, fontWeight: 900 },
  expired: {
    fontSize: 14,
    color: "rgba(16,16,20,0.6)",
    textAlign: "center",
    padding: 8,
  },
  timerWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  timerSvg: { transform: "rotate(0deg)" },
  timerText: {
    position: "absolute",
    fontSize: 11,
    fontWeight: 800,
    color: "var(--slop-ink)",
    fontVariantNumeric: "tabular-nums",
  },
};
