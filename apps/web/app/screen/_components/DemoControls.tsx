"use client";

/**
 * Demo controls — play/pause/restart/step plus the current scene label and
 * progress. On-stage these are the operator's rehearsal tools; in a live run
 * they're hidden and the WebSocket drives the state.
 */
export function DemoControls({
  playing,
  finished,
  stepIndex,
  totalSteps,
  label,
  onToggle,
  onRestart,
  onStep,
}: {
  playing: boolean;
  finished: boolean;
  stepIndex: number;
  totalSteps: number;
  label?: string;
  onToggle: () => void;
  onRestart: () => void;
  onStep: () => void;
}) {
  const progress = totalSteps > 0 ? stepIndex / totalSteps : 0;
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
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(10,10,26,0.7)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.12)",
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
