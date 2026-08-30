"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AttentionProofReceipt, BrandSummary } from "@slopstream/shared";
import { useStream } from "@/lib/useStream";
import { AudioVisualizer } from "./_components/AudioVisualizer";
import { ChallengeCard } from "./_components/ChallengeCard";
import { ProofReceipt } from "./_components/ProofReceipt";

/**
 * The listener experience — a game show on a phone (design-language.md "The
 * listener client — playful, urgent, satisfying"). QR join → listen with an
 * audio-reactive visualizer → challenge pops in → answer → proof receipt
 * (the calm center) → keep listening.
 *
 * In demo mode the stream state comes from the fixture; the challenge answer
 * produces a canned proof receipt. In live mode the challenge response is
 * POSTed to /attention-proofs and the receipt comes back from Lane 1's
 * verifier via Lane 2's API.
 */
export default function ListenPage() {
  const { state, mode } = useStream();
  const [joined, setJoined] = useState(false);
  const [receipt, setReceipt] = useState<AttentionProofReceipt | null>(null);
  const [balance, setBalance] = useState(0);
  const [todayVerified, setTodayVerified] = useState(0);

  // The brand currently playing — drives the screen tint + visualizer color.
  const activeBrandId =
    state.nowPlaying?.brandId ?? state.generation?.brandId ?? null;
  const activeBrand: BrandSummary | undefined = activeBrandId
    ? state.brandById[activeBrandId]
    : undefined;
  const brandColor = activeBrand?.primaryColor ?? "#ffd76a";

  // Set brand-palette CSS variables for this surface too.
  useEffect(() => {
    const root = document.documentElement;
    if (activeBrand) {
      root.style.setProperty("--brand-primary", activeBrand.primaryColor);
      root.style.setProperty("--brand-secondary", activeBrand.secondaryColor);
    } else {
      root.style.setProperty("--brand-primary", "var(--platform-bg-2)");
      root.style.setProperty("--brand-secondary", "var(--platform-bg-1)");
    }
  }, [activeBrand]);

  // Auto-join after the splash animation.
  useEffect(() => {
    if (!joined) {
      const t = setTimeout(() => setJoined(true), 1600);
      return () => clearTimeout(t);
    }
  }, [joined]);

  const challenge = state.activeChallenge;
  const attention = state.attention;

  const handleAnswer = (answer: string) => {
    if (!challenge) return;
    // In demo mode, produce a canned receipt. In live mode, POST to
    // /attention-proofs and use the returned AttentionProofReceipt.
    if (mode === "live") {
      void submitProofLive(challenge.id, challenge.segmentId, answer).then(
        setReceipt,
      );
    } else {
      // Demo: the "correct" answer is the first option (matches the fixture's
      // CoolStartup Postgres question). A real backend checks this server-side.
      const correct = challenge.options?.[1] ?? answer;
      const verified = answer === correct;
      const estimatedReward = verified ? 0.37 : undefined;
      setReceipt({
        proofId: `0x${Math.random().toString(16).slice(2, 10)}`,
        segmentId: challenge.segmentId,
        challengeId: challenge.id,
        brandId: activeBrandId ?? "unknown",
        challengeType: challenge.type,
        verified,
        estimatedRewardUsd: estimatedReward,
        createdAt: new Date().toISOString(),
      });
      if (verified) {
        setBalance((b) => b + (estimatedReward ?? 0));
        setTodayVerified((t) => t + (estimatedReward ?? 0));
      }
    }
  };

  return (
    <main style={styles.main}>
      <div className="slop-canvas" />

      <div style={styles.frame}>
        <AnimatePresence mode="wait">
          {!joined ? (
            <JoinSplash key="splash" />
          ) : (
            <motion.div
              key="listening"
              style={styles.content}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <header style={styles.header}>
                <span style={styles.logo}>SLOPSTREAM</span>
                <div style={styles.balancePill}>
                  <span style={styles.balanceLabel}>Balance</span>
                  <span style={styles.balanceAmount}>
                    ${balance.toFixed(2)}
                  </span>
                </div>
              </header>

              <div style={styles.nowPlaying}>
                <div style={styles.listeningLabel}>
                  You&apos;re listening to
                </div>
                <div style={{ ...styles.brandName, color: brandColor }}>
                  {activeBrand?.name ?? "Free Ad"}
                </div>
              </div>

              <AudioVisualizer
                brandColor={brandColor}
                active={!!state.nowPlaying}
              />

              {/* Attention reward pool + live meter */}
              {attention && (
                <div style={styles.meter}>
                  <div style={styles.meterLabel}>Live attention meter</div>
                  <div style={styles.meterCount}>
                    <span className="slop-figures">
                      {attention.verifiedCount}
                    </span>
                    <span style={styles.meterDim}> / </span>
                    <span className="slop-figures" style={styles.meterDim}>
                      {attention.threshold}
                    </span>
                    <span style={styles.meterDim}> verified</span>
                  </div>
                  <div style={styles.meterBar}>
                    <motion.div
                      style={{
                        ...styles.meterFill,
                        background:
                          attention.verifiedCount >= attention.threshold
                            ? "var(--threshold-bright)"
                            : brandColor,
                      }}
                      animate={{
                        width: `${Math.min((attention.verifiedCount / attention.threshold) * 100, 100)}%`,
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 90,
                        damping: 18,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Challenge card */}
              <AnimatePresence>
                {challenge && !receipt && (
                  <ChallengeCard
                    key={challenge.id}
                    challenge={challenge}
                    brandColor={brandColor}
                    onAnswer={handleAnswer}
                  />
                )}
              </AnimatePresence>

              {/* Today's verified */}
              <div style={styles.todayRow}>
                <span style={styles.todayLabel}>
                  Today&apos;s verified attention
                </span>
                <span style={styles.todayAmount}>
                  +${todayVerified.toFixed(2)}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Proof receipt — the calm center, overlays everything */}
      {receipt && (
        <ProofReceipt
          receipt={receipt}
          brand={activeBrand}
          onDismiss={() => setReceipt(null)}
        />
      )}
    </main>
  );
}

function JoinSplash() {
  return (
    <motion.div
      style={styles.splash}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
    >
      <motion.div
        style={styles.splashOrb}
        animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <div style={styles.splashTitle}>SLOPSTREAM</div>
      <div style={styles.splashSub}>Entering the stream…</div>
    </motion.div>
  );
}

/** Live-mode proof submission — POSTs to the API and returns the receipt. */
async function submitProofLive(
  challengeId: string,
  segmentId: string,
  answer: string,
): Promise<AttentionProofReceipt | null> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  try {
    const res = await fetch(`${base}/attention-proofs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listenerCommitment: "demo-listener",
        segmentId,
        challengeId,
        resultProof: JSON.stringify({ answer }),
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as AttentionProofReceipt;
  } catch {
    return null;
  }
}

const styles: Record<string, React.CSSProperties> = {
  main: { position: "relative", minHeight: "100vh", overflow: "hidden" },
  frame: {
    position: "relative",
    zIndex: 1,
    maxWidth: 440,
    margin: "0 auto",
    padding: "16px 18px 32px",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  splash: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "80vh",
    position: "relative",
  },
  splashOrb: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, var(--platform-accent), transparent 70%)",
    filter: "blur(20px)",
  },
  splashTitle: {
    fontSize: 36,
    fontWeight: 900,
    letterSpacing: 6,
    color: "#fff",
    position: "relative",
  },
  splashSub: {
    fontSize: 16,
    color: "var(--platform-text-dim)",
    marginTop: 8,
    position: "relative",
  },
  content: { display: "flex", flexDirection: "column", gap: 16 },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  logo: { fontSize: 16, fontWeight: 900, letterSpacing: 3, color: "#fff" },
  balancePill: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    background: "rgba(255,255,255,0.08)",
    padding: "6px 12px",
    borderRadius: 12,
  },
  balanceLabel: {
    fontSize: 10,
    letterSpacing: 1,
    color: "var(--platform-text-dim)",
    fontWeight: 600,
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: 800,
    color: "var(--platform-accent)",
    fontVariantNumeric: "tabular-nums",
  },
  nowPlaying: { textAlign: "center", marginTop: 4 },
  listeningLabel: {
    fontSize: 13,
    color: "var(--platform-text-dim)",
    fontWeight: 600,
  },
  brandName: { fontSize: 28, fontWeight: 900, marginTop: 4 },
  meter: { display: "flex", flexDirection: "column", gap: 6 },
  meterLabel: {
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: 700,
    color: "var(--platform-text-dim)",
  },
  meterCount: { fontSize: 20, fontWeight: 800 },
  meterDim: { color: "var(--platform-text-dim)", fontWeight: 600 },
  meterBar: {
    height: 10,
    borderRadius: 5,
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  meterFill: { height: "100%", borderRadius: 5 },
  todayRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "12px 0",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  todayLabel: {
    fontSize: 13,
    color: "var(--platform-text-dim)",
    fontWeight: 600,
  },
  todayAmount: {
    fontSize: 18,
    fontWeight: 800,
    color: "#4ade80",
    fontVariantNumeric: "tabular-nums",
  },
};
