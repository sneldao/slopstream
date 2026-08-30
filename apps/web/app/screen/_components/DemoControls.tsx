"use client";

import { useEffect } from "react";

/**
 * Demo controls — play/pause/restart/step plus the current scene label and
 * progress. Theater mode is owned by the screen page so nav/HUD hide together.
 * Keyboard: Space/k play, →/n step, r restart (T is handled by useTheaterMode).
 */
export function DemoControls({
  playing,
  finished,
  stepIndex,
  totalSteps,
  label,
  theater,
  onToggle,
  onRestart,
  onStep,
  onEnterTheater,
}: {
  playing: boolean;
  finished: boolean;
  stepIndex: number;
  totalSteps: number;
  label?: string;
  theater: boolean;
  onToggle: () => void;
  onRestart: () => void;
  onStep: () => void;
  onEnterTheater: () => void;
}) {
  const progress = totalSteps > 0 ? stepIndex / totalSteps : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        onToggle();
      } else if (e.key === "ArrowRight" || e.key === "n") {
        e.preventDefault();
        onStep();
      } else if (e.key === "r") {
        e.preventDefault();
        onRestart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle, onStep, onRestart]);

  if (theater) {
    return (
      <div style={styles.theaterHint} aria-hidden="true">
        Theater · Space / → / R · press T to show chrome
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.bar}>
        <button
          style={styles.btn}
          onClick={onToggle}
          aria-label={playing ? "Pause" : "Play"}
        >
          {finished ? "↻" : playing ? "❚❚" : "▶"}
        </button>
        <button style={styles.btn} onClick={onStep} aria-label="Step">
          ⏭
        </button>
        <button style={styles.btn} onClick={onRestart} aria-label="Restart">
          ⟳
        </button>
        <button
          style={styles.btn}
          onClick={onEnterTheater}
          aria-label="Enter theater mode"
          title="Hide chrome (T)"
        >
          ◻
        </button>
        <div style={styles.label}>
          {label ?? (finished ? "Demo complete" : "Live")}
        </div>
        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressFill,
              width: `${Math.round(progress * 100)}%`,
            }}
          />
        </div>
        <div style={styles.count}>
          {Math.min(stepIndex, totalSteps)}/{totalSteps}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "fixed",
    bottom: 14,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 100,
  },
  theaterHint: {
    position: "fixed",
    bottom: 10,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 100,
    opacity: 0.35,
    color: "#101014",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    pointerEvents: "none",
  },
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(8,8,18,0.82)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,228,94,0.3)",
    borderRadius: 999,
    padding: "6px 14px",
    color: "#fff",
    fontSize: 13,
  },
  btn: {
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "#fff",
    borderRadius: 8,
    width: 30,
    height: 30,
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
  },
  label: {
    fontWeight: 700,
    letterSpacing: 0.5,
    minWidth: 120,
    color: "var(--platform-text-dim)",
  },
  progressTrack: {
    width: 120,
    height: 4,
    borderRadius: 2,
    background: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "var(--platform-accent)",
    transition: "width 300ms ease",
  },
  count: {
    fontVariantNumeric: "tabular-nums",
    color: "var(--platform-text-dim)",
    fontWeight: 600,
  },
};
