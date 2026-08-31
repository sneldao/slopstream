"use client";

import { AnimatedNumber } from "./AnimatedNumber";

/**
 * The stats footer — the growth ticker first (review: "show the compounding"):
 * cumulative dollars paid to viewers leads the row in hero treatment, then
 * live listeners and attention proofs. Numbers count up smoothly, never snap
 * (design-language.md "The stats footer").
 */
export function StatsFooter({
  listeners,
  attentionProofs,
  listenerRewardsUsd,
}: {
  listeners: number;
  attentionProofs: number;
  listenerRewardsUsd: number;
}) {
  return (
    <div style={styles.row}>
      <Stat icon="💸" label="paid to viewers" hero>
        <AnimatedNumber
          value={listenerRewardsUsd}
          format={(n) => `$${n.toFixed(2)}`}
        />
      </Stat>
      <Stat icon="👀" label="listeners">
        <AnimatedNumber value={listeners} />
      </Stat>
      <Stat icon="✓" label="attention proofs">
        <AnimatedNumber value={attentionProofs} />
      </Stat>
    </div>
  );
}

function Stat({
  icon,
  label,
  hero = false,
  children,
}: {
  icon: string;
  label: string;
  hero?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.stat}>
      <span style={styles.icon}>{icon}</span>
      <span
        style={{
          ...styles.value,
          ...(hero ? styles.valueHero : {}),
        }}
      >
        {children}
      </span>
      <span
        style={{
          ...styles.label,
          ...(hero ? styles.labelHero : {}),
        }}
      >
        {label}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: "flex",
    gap: "clamp(14px, 2vw, 32px)",
    flexWrap: "wrap",
    alignItems: "baseline",
    padding: "10px 18px",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 999,
    background: "rgba(244,241,232,0.9)",
    boxShadow: "0 16px 50px rgba(0,0,0,0.3)",
    backdropFilter: "blur(16px)",
  },
  stat: { display: "flex", alignItems: "baseline", gap: 7 },
  icon: { fontSize: 15 },
  value: {
    fontSize: "clamp(20px, 2.6vw, 30px)",
    fontWeight: 800,
    color: "var(--slop-ink)",
  },
  valueHero: {
    fontSize: "clamp(26px, 3.4vw, 40px)",
    fontWeight: 900,
    borderBottom: "3px solid var(--slop-yellow)",
  },
  label: {
    fontSize: 12,
    letterSpacing: 1.5,
    color: "rgba(16,16,20,0.58)",
    fontWeight: 750,
    textTransform: "uppercase",
  },
  labelHero: {
    fontSize: 12,
    fontWeight: 900,
    color: "var(--slop-ink)",
  },
};
