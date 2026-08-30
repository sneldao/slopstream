"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  AttentionProofReceipt,
  BrandSummary,
  ListenerSession,
} from "@slopstream/shared";
import { useStream } from "@/lib/useStream";
import { useAudioSignal } from "@/lib/useAudioSignal";
import { useSoundDesign } from "@/lib/useSoundDesign";
import { AudioVisualizer } from "./_components/AudioVisualizer";
import { ChallengeCard } from "./_components/ChallengeCard";
import { ProofReceipt } from "./_components/ProofReceipt";
import { requestJson } from "@/lib/liveApi";
import { SphereField } from "../_components/SphereField";
import { SurfaceHeader } from "../_components/SurfaceHeader";
import { FirstRunCoach } from "../_components/FirstRunCoach";
import { continuumBlurb, continuumChapter } from "@/lib/continuum";

/**
 * The listener experience — a game show on a phone. Full-bleed audio-
 * reactive visualizer, floating challenge card, the proof receipt as the
 * one calm moment. Sound fires on challenge appearance and proof verified.
 */
export default function ListenPage() {
  const { state, mode, connectionStatus } = useStream();
  // In live mode, play real audio from the segment's asset URL so the
  // listener actually hears the ad. In demo mode, the synthesized signal
  // drives the visualizer.
  const audioUrl = state.nowPlaying?.assetUrl?.match(/\.(mp3|wav|ogg)$/i)
    ? state.nowPlaying.assetUrl
    : undefined;
  const { signalRef, unlock, muted, toggleMute } = useAudioSignal(
    !!state.nowPlaying,
    audioUrl,
  );
  const { play } = useSoundDesign();
  const [joined, setJoined] = useState(false);
  const [receipt, setReceipt] = useState<AttentionProofReceipt | null>(null);
  const [balance, setBalance] = useState(0);
  const [todayVerified, setTodayVerified] = useState(0);
  const [earnMode, setEarnMode] = useState(false);
  const [listenerIdentity, setListenerIdentity] =
    useState<ListenerIdentity | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  useEffect(() => {
    setEarnMode(window.localStorage.getItem(EARN_MODE_KEY) === "on");
  }, []);

  useEffect(() => {
    if (mode !== "live") return;
    const commitment = readOrCreateCommitment();
    const token =
      window.sessionStorage.getItem(LISTENER_TOKEN_KEY) ?? undefined;
    void requestJson<ListenerSessionResponse>(
      "/listener-sessions",
      {
        method: "POST",
        body: JSON.stringify({ listenerCommitment: commitment }),
      },
      token,
    )
      .then(({ token: nextToken, session }) => {
        window.sessionStorage.setItem(LISTENER_TOKEN_KEY, nextToken);
        setListenerIdentity({ token: nextToken, commitment });
        setBalance(session.availableBalanceUsd);
        setTodayVerified(session.todayVerifiedUsd);
      })
      .catch((error: unknown) => setSubmissionError(errorMessage(error)));
  }, [mode]);

  useEffect(() => {
    if (mode !== "live" || !listenerIdentity) return;
    const refresh = () => {
      void requestJson<{ session: ListenerSession }>(
        "/listener-sessions/me",
        { method: "GET" },
        listenerIdentity.token,
      )
        .then(({ session }) => {
          setBalance(session.availableBalanceUsd);
          setTodayVerified(session.todayVerifiedUsd);
        })
        .catch(() => {
          // A transient heartbeat failure must not interrupt the challenge UI.
        });
    };
    const interval = setInterval(refresh, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [listenerIdentity, mode]);

  const activeBrandId =
    state.nowPlaying?.brandId ?? state.generation?.brandId ?? null;
  const activeBrand: BrandSummary | undefined = activeBrandId
    ? state.brandById[activeBrandId]
    : undefined;
  const brandColor = activeBrand?.primaryColor ?? "#ffd76a";

  useEffect(() => {
    if (activeBrand) {
      const root = document.documentElement;
      root.style.setProperty("--brand-primary", activeBrand.primaryColor);
      root.style.setProperty("--brand-secondary", activeBrand.secondaryColor);
    } else {
      const root = document.documentElement;
      root.style.setProperty("--brand-primary", "var(--platform-bg-2)");
      root.style.setProperty("--brand-secondary", "var(--platform-bg-1)");
    }
  }, [activeBrand]);

  const challenge = state.activeChallenge;
  const attention = state.attention;

  const handleJoin = () => {
    if (joined) return;
    unlock();
    play("join");
    setJoined(true);
  };

  const toggleEarnMode = () => {
    setEarnMode((enabled) => {
      const next = !enabled;
      window.localStorage.setItem(EARN_MODE_KEY, next ? "on" : "off");
      if (!next) setReceipt(null);
      return next;
    });
  };

  // Challenge sounds belong only to the explicitly enabled earn experience.
  const lastChallengeId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (earnMode && challenge && challenge.id !== lastChallengeId.current) {
      lastChallengeId.current = challenge.id;
      play("challenge");
    }
  }, [challenge, earnMode, play]);

  const handleAnswer = (answer: string) => {
    if (!challenge) return;
    if (mode === "live") {
      if (!listenerIdentity) {
        setSubmissionError(
          "Connecting your listener session. Please try again.",
        );
        return;
      }
      setSubmissionError(null);
      void submitProofLive(
        listenerIdentity,
        challenge.id,
        challenge.segmentId,
        answer,
      )
        .then(({ receipt: nextReceipt, session }) => {
          setReceipt(nextReceipt);
          setBalance(session.availableBalanceUsd);
          setTodayVerified(session.todayVerifiedUsd);
          if (nextReceipt.verified) play("proof");
        })
        .catch((error: unknown) => setSubmissionError(errorMessage(error)));
      return;
    }

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
      verifierMode: "stub",
      createdAt: new Date().toISOString(),
    });
    if (verified) {
      play("proof");
      setBalance((b) => b + (estimatedReward ?? 0));
      setTodayVerified((t) => t + (estimatedReward ?? 0));
    }
  };

  return (
    <main
      className="listen-shell slop-surface-shell has-dock"
      style={styles.main}
    >
      {/* Full-bleed audio-reactive background */}
      <FullBleedVisualizer
        signalRef={signalRef}
        brandColor={brandColor}
        secondaryColor={activeBrand?.secondaryColor ?? "#0b0b1a"}
        active={!!state.nowPlaying}
      />
      <SphereField className="sphere-field--soft listen-spheres" />
      <div className="slop-grain" />

      <SurfaceHeader
        role="02"
        subtitle="Listener channel"
        trailing={
          joined ? (
            <>
              <button
                type="button"
                className="slop-hud-pill"
                onClick={toggleEarnMode}
                aria-pressed={earnMode}
                style={earnMode ? styles.earnModeOn : undefined}
              >
                {earnMode ? "Earn mode on" : "Earn mode off"}
              </button>
              <button
                type="button"
                className="slop-hud-pill"
                onClick={toggleMute}
                aria-pressed={muted}
                aria-label={muted ? "Unmute stream" : "Mute stream"}
              >
                {muted ? "Muted" : "Sound on"}
              </button>
              <motion.div
                style={styles.balancePill}
                key={balance}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 14,
                }}
                aria-live="polite"
              >
                <span style={styles.balanceLabel}>Balance</span>
                <span style={styles.balanceAmount}>${balance.toFixed(2)}</span>
              </motion.div>
            </>
          ) : undefined
        }
      />

      <div className="slop-frame">
        <AnimatePresence mode="wait">
          {!joined ? (
            <JoinSplash key="splash" onJoin={handleJoin} />
          ) : (
            <motion.div
              key="listening"
              style={styles.content}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <FirstRunCoach
                storageKey="slopstream.coach.listen.v1"
                title="How you earn"
                steps={[
                  "Listen while the ad plays",
                  "Answer the quick attention check",
                  "Verified attention funds listener rewards",
                ]}
              />

              <p className="slop-value-prop">
                {earnMode
                  ? "Earn Mode is on — answer quick checks while ads play to share in listener rewards."
                  : "Listen without interruptions. Turn on Earn Mode whenever you want to answer checks for rewards."}
              </p>

              {mode === "live" && connectionStatus !== "connected" && (
                <div role="status" style={styles.signalNotice}>
                  <span style={styles.signalDot} />
                  Reconnecting to the live stream
                </div>
              )}

              {/* Now playing — floating over the visualizer */}
              <motion.div
                style={styles.nowPlaying}
                key={activeBrandId ?? "free"}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
              >
                <div style={styles.listeningLabel}>
                  Now flooding your frequency
                </div>
                <div style={{ ...styles.brandName, color: brandColor }}>
                  {activeBrand?.name ?? "Open Stream"}
                </div>
                {state.nowPlaying && (
                  <>
                    <div style={styles.chapter}>
                      {continuumChapter(state.nowPlaying, activeBrand)}
                    </div>
                    <div style={styles.blurb}>
                      {continuumBlurb(state.nowPlaying)}
                    </div>
                  </>
                )}
                <div style={styles.nowPlayingRule} />
              </motion.div>

              {/* Audio visualizer — the heartbeat blob */}
              <AudioVisualizer
                brandColor={brandColor}
                active={!!state.nowPlaying}
                signalRef={signalRef}
              />

              <div className="slop-meter" style={styles.poolCard}>
                <div style={styles.meterLabel}>Listener reward pool</div>
                <div style={styles.poolAmount} aria-live="polite">
                  ${state.listenerRewardsUsd.toFixed(2)}
                </div>
                <div style={styles.meterHint}>
                  {state.lastClear
                    ? `Last clear unlocked $${state.lastClear.listenerPoolUsd.toFixed(2)} for listeners (80%).`
                    : attention
                      ? "When the meter fills, this segment’s rewards unlock."
                      : "Rewards unlock when verified attention clears a segment."}
                </div>
              </div>

              {/* Live attention meter — liquid fill */}
              {attention && (
                <motion.div
                  className="slop-meter"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div style={styles.meterLabel}>Live attention meter</div>
                  <div style={styles.meterHint}>
                    When this fills, rewards unlock for the segment.
                  </div>
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
                  <div className="slop-meter__bar">
                    <motion.div
                      className="slop-meter__fill"
                      style={{
                        background:
                          attention.verifiedCount >= attention.threshold
                            ? "linear-gradient(90deg, #ffe066, #ff9d4a)"
                            : `linear-gradient(90deg, ${brandColor}, ${activeBrand?.secondaryColor ?? brandColor})`,
                      }}
                      animate={{
                        width: `${Math.min(
                          (attention.verifiedCount / attention.threshold) * 100,
                          100,
                        )}%`,
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 90,
                        damping: 18,
                      }}
                    />
                  </div>
                </motion.div>
              )}

              {/* Challenge cards belong to the optional earning layer. */}
              <AnimatePresence>
                {earnMode && challenge && !receipt && (
                  <ChallengeCard
                    key={challenge.id}
                    challenge={challenge}
                    brandColor={brandColor}
                    onAnswer={handleAnswer}
                  />
                )}
              </AnimatePresence>

              {submissionError && (
                <div role="alert" style={styles.submissionError}>
                  {submissionError}
                </div>
              )}

              {/* Today's verified — drifting at the bottom */}
              <div style={styles.todayRow} aria-live="polite">
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

/** Full-bleed audio-reactive background canvas — the room feels the stream. */
function FullBleedVisualizer({
  signalRef,
  brandColor,
  secondaryColor,
  active,
}: {
  signalRef: React.RefObject<import("@/lib/useAudioSignal").AudioSignal>;
  brandColor: string;
  secondaryColor: string;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let phase = 0;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      phase += 0.02;
      const signal = signalRef.current;
      const amp = active ? signal.smoothAmplitude : 0.05;
      const beat = active ? signal.beat : 0;

      ctx.fillStyle = "rgba(11, 11, 26, 0.12)";
      ctx.fillRect(0, 0, w, h);

      // Drifting brand-tinted blobs.
      const cx = w / 2;
      const cy = h * 0.35;
      const baseR = Math.min(w, h) * 0.3;
      const r = baseR * (1 + amp * 0.4 + beat * 0.2);

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, hexA(brandColor, 0.4 + amp * 0.2));
      grad.addColorStop(0.5, hexA(secondaryColor, 0.2 + amp * 0.1));
      grad.addColorStop(1, "rgba(11, 11, 26, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Secondary drifting blob.
      const cx2 = w * 0.3 + Math.sin(phase) * 40;
      const cy2 = h * 0.6 + Math.cos(phase * 0.7) * 30;
      const r2 = baseR * 0.5 * (1 + amp * 0.3);
      const grad2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, r2);
      grad2.addColorStop(0, hexA(secondaryColor, 0.3 + amp * 0.15));
      grad2.addColorStop(1, "rgba(11, 11, 26, 0)");
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.arc(cx2, cy2, r2, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [signalRef, brandColor, secondaryColor, active]);

  return (
    <canvas ref={canvasRef} width={440} height={900} style={styles.bgCanvas} />
  );
}

function JoinSplash({ onJoin }: { onJoin: () => void }) {
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
      <div style={styles.splashTitle}>Join the stream</div>
      <div style={styles.splashSub}>
        Listen. Prove you were here. Earn rewards.
      </div>
      <motion.button
        type="button"
        style={styles.joinButton}
        onClick={onJoin}
        whileTap={{ scale: 0.97 }}
        whileHover={{ scale: 1.03 }}
      >
        Tap to join
      </motion.button>
      <div style={styles.splashHint}>Enables audio on this device</div>
    </motion.div>
  );
}

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16) || 255;
  const g = parseInt(full.slice(2, 4), 16) || 255;
  const b = parseInt(full.slice(4, 6), 16) || 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const LISTENER_TOKEN_KEY = "slopstream.listener-token";
const EARN_MODE_KEY = "slopstream.listener.earn-mode.v1";
const LISTENER_COMMITMENT_KEY = "slopstream.listener-commitment";

interface ListenerIdentity {
  token: string;
  commitment: string;
}

interface ListenerSessionResponse {
  token: string;
  session: ListenerSession;
}

function readOrCreateCommitment(): string {
  const existing = window.sessionStorage.getItem(LISTENER_COMMITMENT_KEY);
  if (existing) return existing;
  const commitment =
    typeof crypto.randomUUID === "function"
      ? `listener:${crypto.randomUUID()}`
      : `listener:${Math.random().toString(36).slice(2)}:${Date.now()}`;
  window.sessionStorage.setItem(LISTENER_COMMITMENT_KEY, commitment);
  return commitment;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to submit proof.";
}

async function submitProofLive(
  identity: ListenerIdentity,
  challengeId: string,
  segmentId: string,
  answer: string,
): Promise<{ receipt: AttentionProofReceipt; session: ListenerSession }> {
  const receipt = await requestJson<AttentionProofReceipt>(
    "/attention-proofs",
    {
      method: "POST",
      body: JSON.stringify({
        listenerCommitment: identity.commitment,
        segmentId,
        challengeId,
        resultProof: JSON.stringify({ answer }),
      }),
    },
    identity.token,
  );
  const { session } = await requestJson<{ session: ListenerSession }>(
    "/listener-sessions/me",
    { method: "GET" },
    identity.token,
  );
  return { receipt, session };
}

const styles: Record<string, React.CSSProperties> = {
  main: { position: "relative", minHeight: "100svh" },
  bgCanvas: {
    position: "fixed",
    inset: 0,
    width: "100%",
    height: "100%",
    zIndex: 0,
    pointerEvents: "none",
  },
  frame: {
    position: "relative",
    zIndex: 3,
    width: "100%",
  },
  splash: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "70svh",
    position: "relative",
    paddingBottom: 24,
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
    fontFamily: "var(--slop-display)",
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 1,
    color: "#fff",
    position: "relative",
    textTransform: "uppercase" as const,
  },
  splashSub: {
    maxWidth: "28ch",
    fontSize: 16,
    color: "var(--platform-text-dim)",
    marginTop: 8,
    position: "relative",
    textAlign: "center",
    lineHeight: 1.35,
    fontWeight: 650,
  },
  joinButton: {
    position: "relative",
    marginTop: 28,
    border: "none",
    borderRadius: 999,
    minHeight: 52,
    width: "min(100%, 280px)",
    padding: "16px 28px",
    background: "var(--slop-yellow)",
    color: "var(--slop-ink)",
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    boxShadow: "0 10px 28px rgba(255,228,94,0.28)",
  },
  splashHint: {
    position: "relative",
    marginTop: 12,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "rgba(255,255,255,0.45)",
  },
  content: { display: "flex", flexDirection: "column", gap: 18 },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
    padding: "8px 0",
  },
  headerBrand: { display: "flex", flexDirection: "column", gap: 4 },
  logo: {
    fontSize: 16,
    fontWeight: 900,
    color: "#fff",
    textDecoration: "none",
  },
  channel: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 8,
    fontWeight: 900,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  chapter: {
    marginTop: 10,
    color: "var(--slop-yellow)",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  blurb: {
    maxWidth: "34ch",
    margin: "8px auto 0",
    color: "rgba(255,253,246,0.62)",
    fontSize: 13,
    fontWeight: 650,
    lineHeight: 1.35,
  },
  poolCard: { gap: 6 },
  poolAmount: {
    fontSize: 28,
    fontWeight: 900,
    color: "var(--slop-yellow)",
    fontVariantNumeric: "tabular-nums",
  },
  valueProp: {
    margin: 0,
    padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    background: "rgba(8,8,18,0.5)",
    backdropFilter: "blur(12px)",
    color: "rgba(255,253,246,0.72)",
    fontSize: 13,
    fontWeight: 650,
    lineHeight: 1.4,
  },
  balancePill: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    background: "var(--slop-yellow)",
    color: "var(--slop-ink)",
    padding: "8px 13px",
    borderRadius: 999,
    boxShadow: "0 8px 24px rgba(255,228,94,0.24)",
  },
  earnModeOn: {
    borderColor: "var(--slop-lime)",
    background: "var(--slop-lime)",
    color: "var(--slop-ink)",
    boxShadow: "0 0 20px rgba(184,255,101,0.26)",
  },
  balanceLabel: {
    fontSize: 10,
    letterSpacing: 1,
    color: "rgba(16,16,20,0.62)",
    fontWeight: 600,
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: 800,
    color: "var(--slop-ink)",
    fontVariantNumeric: "tabular-nums",
  },
  signalNotice: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "9px 12px",
    border: "1px solid rgba(255,228,94,0.3)",
    borderRadius: 999,
    color: "var(--slop-yellow)",
    background: "rgba(8,8,18,0.58)",
    backdropFilter: "blur(14px)",
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  signalDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "currentColor",
    boxShadow: "0 0 12px currentColor",
  },
  nowPlaying: { textAlign: "center", marginTop: 10 },
  listeningLabel: {
    fontSize: 9,
    color: "rgba(255,255,255,0.62)",
    fontWeight: 900,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  brandName: {
    fontFamily: "var(--slop-display)",
    fontSize: 44,
    fontWeight: 900,
    letterSpacing: -1.5,
    lineHeight: 0.95,
    marginTop: 8,
    textTransform: "uppercase",
    textShadow: "0 8px 30px rgba(0,0,0,0.36)",
  },
  nowPlayingRule: {
    width: 42,
    height: 4,
    margin: "14px auto 0",
    borderRadius: 999,
    background: "currentColor",
  },
  meter: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 18,
    background: "rgba(8,8,18,0.58)",
    backdropFilter: "blur(16px)",
  },
  meterLabel: {
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: 700,
    color: "var(--platform-text-dim)",
  },
  meterHint: {
    fontSize: 12,
    fontWeight: 650,
    color: "rgba(255,253,246,0.58)",
    lineHeight: 1.35,
  },
  meterCount: { fontSize: 20, fontWeight: 800 },
  meterDim: { color: "var(--platform-text-dim)", fontWeight: 600 },
  meterBar: {
    height: 14,
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  meterFill: { height: "100%", borderRadius: 999 },
  submissionError: {
    fontSize: 13,
    color: "#ff9b9b",
    textAlign: "center",
    fontWeight: 700,
  },
  todayRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "15px 16px",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 18,
    background: "rgba(255,255,255,0.08)",
    backdropFilter: "blur(16px)",
  },
  todayLabel: {
    fontSize: 13,
    color: "var(--platform-text-dim)",
    fontWeight: 600,
  },
  todayAmount: {
    fontSize: 22,
    fontWeight: 800,
    color: "#4ade80",
    fontVariantNumeric: "tabular-nums",
  },
};
