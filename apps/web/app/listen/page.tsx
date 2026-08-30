"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  AttentionProofReceipt,
  BrandSummary,
  ListenerSession,
  PayoutReceipt,
} from "@slopstream/shared";
import { useStream } from "@/lib/useStream";
import { useAudioSignal } from "@/lib/useAudioSignal";
import { useSoundDesign } from "@/lib/useSoundDesign";
import { AudioVisualizer } from "./_components/AudioVisualizer";
import { AttentionCheck } from "./_components/AttentionCheck";
import { ProofReceipt } from "./_components/ProofReceipt";
import { requestJson } from "@/lib/liveApi";
import { hexA } from "@/lib/color";
import { errorMessage } from "@/lib/errors";
import { expectedDemoAnswer } from "@/lib/demoFixture";
import { SphereField } from "../_components/SphereField";
import { SurfaceHeader } from "../_components/SurfaceHeader";
import { FirstRunCoach } from "../_components/FirstRunCoach";
import { LoopStatus } from "../_components/LoopStatus";
import { PayoutSheet } from "./_components/PayoutSheet";

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
  // One object so pending -> available moves are a single pure update. Two
  // separate states forced a setAvailableUsd call inside a setPendingUsd
  // updater, which StrictMode double-invokes.
  const [balances, setBalances] = useState({ availableUsd: 0, pendingUsd: 0 });
  const { availableUsd, pendingUsd } = balances;
  const [todayVerified, setTodayVerified] = useState(0);
  const [earnMode, setEarnMode] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [listenerIdentity, setListenerIdentity] =
    useState<ListenerIdentity | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const lastClearBurstId = useRef(0);

  const applySession = (session: ListenerSession) => {
    setBalances({
      availableUsd: session.availableBalanceUsd,
      pendingUsd: session.pendingBalanceUsd,
    });
    setTodayVerified(session.todayVerifiedUsd);
  };

  // Stable identity: ProofReceipt's auto-dismiss timer depends on this, and an
  // inline arrow would reset that timer on every parent render.
  const dismissReceipt = useCallback(() => setReceipt(null), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stored = window.localStorage.getItem(EARN_MODE_KEY) === "on";
    const fromQuery = params.get("earn") === "1";
    setEarnMode(fromQuery || stored);
    if (fromQuery) window.localStorage.setItem(EARN_MODE_KEY, "on");
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
        applySession(session);
      })
      .catch((error: unknown) =>
        setSubmissionError(errorMessage(error, "Unable to submit proof.")),
      );
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
          applySession(session);
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

  // Demo mode simulates pending → available locally; live mode reads the API.
  useEffect(() => {
    const clear = state.lastClear;
    if (!clear || clear.burstId === lastClearBurstId.current) return;
    lastClearBurstId.current = clear.burstId;
    if (mode === "live" && listenerIdentity) {
      void requestJson<{ session: ListenerSession }>(
        "/listener-sessions/me",
        { method: "GET" },
        listenerIdentity.token,
      )
        .then(({ session }) => applySession(session))
        .catch(() => {
          // Heartbeat failure should not block the celebration moment.
        });
      return;
    }
    setBalances((b) => ({
      availableUsd:
        b.pendingUsd > 0 ? b.availableUsd + b.pendingUsd : b.availableUsd,
      pendingUsd: 0,
    }));
  }, [state.lastClear, mode, listenerIdentity]);

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
          applySession(session);
          if (nextReceipt.verified) play("proof");
        })
        .catch((error: unknown) =>
          setSubmissionError(errorMessage(error, "Unable to submit proof.")),
        );
      return;
    }

    // Demo grading is fixture-driven: the expected answer lives next to the
    // fixture steps (DEMO_CHALLENGE_ANSWERS), not in option order. Challenges
    // without a mapped answer verify by design — the demo never blocks the arc.
    const expected = expectedDemoAnswer(challenge.id);
    const verified = expected === undefined || answer === expected;
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
      setBalances((b) => ({
        ...b,
        pendingUsd: b.pendingUsd + (estimatedReward ?? 0),
      }));
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
              <motion.button
                type="button"
                style={styles.balancePill}
                key={`${availableUsd}-${pendingUsd}`}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 14,
                }}
                aria-live="polite"
                onClick={() => setPayoutOpen(true)}
                title="View pending and available rewards"
              >
                <span style={styles.balanceLabel}>
                  {pendingUsd > 0 ? "Pending" : "Available"}
                </span>
                <span style={styles.balanceAmount}>
                  ${(pendingUsd > 0 ? pendingUsd : availableUsd).toFixed(2)}
                </span>
              </motion.button>
            </>
          ) : undefined
        }
      />

      <div className="slop-frame">
        <LoopStatus state={state} />
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
              {!earnMode && (
                <FirstRunCoach
                  storageKey="slopstream.coach.listen.v1"
                  title="How you earn"
                  steps={[
                    "Listen while the ad plays",
                    "Turn on Earn Mode for checks",
                    "Pending unlocks when a segment clears",
                  ]}
                />
              )}

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
                <div style={styles.listeningLabel}>Now playing</div>
                <div style={{ ...styles.brandName, color: brandColor }}>
                  {activeBrand?.name ?? "Open Stream"}
                </div>
                <div style={styles.nowPlayingRule} />
              </motion.div>

              {/* Audio visualizer — the heartbeat blob */}
              <AudioVisualizer
                brandColor={brandColor}
                active={!!state.nowPlaying}
                signalRef={signalRef}
              />

              {/* Stream state as one continuous readout. The reward pool and
                  the attention threshold used to be two separate glass cards;
                  they are one typographic block with a rule now — the amount
                  is the largest thing here, so nothing has to box it to say
                  it matters. */}
              <section className="listen-readout">
                <span className="listen-readout__label">
                  Listener reward pool
                </span>
                <span className="listen-readout__amount" aria-live="polite">
                  ${state.listenerRewardsUsd.toFixed(2)}
                </span>

                {attention && (
                  <div
                    className={`listen-readout__rule${
                      attention.verifiedCount >= attention.threshold
                        ? " listen-readout__rule--met"
                        : ""
                    }`}
                    style={{
                      ["--fill" as string]: Math.min(
                        attention.threshold > 0
                          ? attention.verifiedCount / attention.threshold
                          : 0,
                        1,
                      ),
                    }}
                    aria-hidden="true"
                  >
                    <i
                      style={
                        attention.verifiedCount >= attention.threshold
                          ? undefined
                          : {
                              background: `linear-gradient(90deg, ${brandColor}, ${
                                activeBrand?.secondaryColor ?? brandColor
                              })`,
                            }
                      }
                    />
                  </div>
                )}

                <p className="listen-readout__note">
                  {attention && (
                    <span>
                      <b className="slop-figures">{attention.verifiedCount}</b>
                      {" / "}
                      <b className="slop-figures">{attention.threshold}</b>
                      {" verified"}
                    </span>
                  )}
                  {state.lastClear ? (
                    <span>
                      Last clear ${state.lastClear.listenerPoolUsd.toFixed(2)}
                    </span>
                  ) : null}
                </p>
              </section>

              {submissionError && (
                <div role="alert" style={styles.submissionError}>
                  {submissionError}
                </div>
              )}

              {/* The wallet as a ledger — rows divided by rules, no panel
                  around them. The CTA stays a pill: it is a control, not a
                  container. */}
              <section className="listen-ledger" aria-live="polite">
                <div className="listen-ledger__row">
                  <span>Pending</span>
                  <strong>${pendingUsd.toFixed(2)}</strong>
                </div>
                <div className="listen-ledger__row">
                  <span>Available</span>
                  <strong>${availableUsd.toFixed(2)}</strong>
                </div>
                <div className="listen-ledger__row listen-ledger__row--mute">
                  <span>Today verified</span>
                  <span>+${todayVerified.toFixed(2)}</span>
                </div>
                <button
                  type="button"
                  className="listen-ledger__cta"
                  onClick={() => setPayoutOpen(true)}
                >
                  {availableUsd > 0 ? "Request payout" : "How payouts work"}
                </button>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The attention check owns the whole viewport when it fires, so it
          lives outside the column rather than inside it. Keeping a
          position:fixed overlay out of `.slop-frame` also means no future
          transform on an ancestor can silently reparent its containing
          block. */}
      <AnimatePresence>
        {joined && earnMode && challenge && !receipt && (
          <AttentionCheck
            key={challenge.id}
            challenge={challenge}
            brandColor={brandColor}
            onAnswer={handleAnswer}
            nowPlayingStartedAt={
              mode === "live" ? state.nowPlayingStartedAt : undefined
            }
          />
        )}
      </AnimatePresence>

      {receipt && (
        <ProofReceipt
          receipt={receipt}
          brand={activeBrand}
          onDismiss={dismissReceipt}
        />
      )}

      <PayoutSheet
        open={payoutOpen}
        availableUsd={availableUsd}
        pendingUsd={pendingUsd}
        onClose={() => setPayoutOpen(false)}
        onRequest={async () => {
          // No try/catch-rethrow here: PayoutSheet awaits this and renders its
          // own error state on rejection, so nothing becomes an unhandled
          // promise rejection.
          if (mode === "live" && listenerIdentity) {
            const { session } = await requestJson<{
              receipt: PayoutReceipt;
              session: ListenerSession;
            }>(
              "/listener-sessions/me/payout-request",
              { method: "POST", body: JSON.stringify({}) },
              listenerIdentity.token,
            );
            applySession(session);
            return;
          }
          setBalances((b) => ({ ...b, availableUsd: 0 }));
        }}
      />
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
      <div style={styles.splashSub}>Listen. Prove. Earn.</div>
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
  splash: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "70svh",
    position: "relative",
    paddingBottom: "var(--s-6)",
  },
  splashOrb: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: "var(--r-round)",
    background:
      "radial-gradient(circle, var(--platform-accent), transparent 70%)",
    filter: "blur(var(--blur-lg))",
  },
  splashTitle: {
    fontFamily: "var(--slop-display)",
    fontSize: "var(--t-title)",
    fontWeight: 900,
    letterSpacing: 1,
    color: "#fff",
    position: "relative",
    textTransform: "uppercase" as const,
  },
  splashSub: {
    maxWidth: "28ch",
    fontSize: "var(--t-lead)",
    color: "var(--platform-text-dim)",
    marginTop: "var(--s-2)",
    position: "relative",
    textAlign: "center",
    lineHeight: 1.35,
    fontWeight: 650,
  },
  joinButton: {
    position: "relative",
    marginTop: 28,
    border: "none",
    borderRadius: "var(--r-pill)",
    minHeight: 52,
    width: "min(100%, 280px)",
    padding: "var(--s-4) 28px",
    background: "var(--slop-yellow)",
    color: "var(--slop-ink)",
    fontSize: "var(--t-body-lg)",
    fontWeight: 900,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    boxShadow: "0 10px 28px rgba(255,228,94,0.28)",
  },
  splashHint: {
    position: "relative",
    marginTop: "var(--s-3)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "rgba(255,255,255,0.45)",
  },
  content: { display: "flex", flexDirection: "column", gap: 18 },
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
    margin: "var(--s-2) auto 0",
    color: "rgba(255,253,246,0.62)",
    fontSize: "var(--t-body)",
    fontWeight: 650,
    lineHeight: 1.35,
  },
  balancePill: {
    border: "none",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    background: "var(--slop-yellow)",
    color: "var(--slop-ink)",
    padding: "var(--s-2) 13px",
    borderRadius: "var(--r-pill)",
    boxShadow: "var(--shadow-glow-accent)",
  },
  earnModeOn: {
    borderColor: "var(--slop-lime)",
    background: "var(--slop-lime)",
    color: "var(--slop-ink)",
    boxShadow: "0 0 20px rgba(184,255,101,0.26)",
  },
  balanceLabel: {
    fontSize: "var(--t-eyebrow)",
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
    gap: "var(--s-2)",
    padding: "9px var(--s-3)",
    border: "1px solid rgba(255,228,94,0.3)",
    borderRadius: "var(--r-pill)",
    color: "var(--slop-yellow)",
    background: "var(--veil-dark-2)",
    backdropFilter: "blur(var(--blur-md))",
    fontSize: "var(--t-micro)",
    fontWeight: 900,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  signalDot: {
    width: 7,
    height: 7,
    borderRadius: "var(--r-round)",
    background: "currentColor",
    boxShadow: "0 0 12px currentColor",
  },
  nowPlaying: { textAlign: "center", marginTop: 10 },
  listeningLabel: {
    fontSize: "var(--t-micro)",
    color: "rgba(255,255,255,0.62)",
    fontWeight: 900,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  brandName: {
    fontFamily: "var(--slop-display)",
    // Fluid rather than a fixed 44px: brand names vary wildly in length and
    // this is the surface's largest standing type.
    fontSize: "var(--t-display)",
    fontWeight: 900,
    letterSpacing: "var(--track-tight)",
    lineHeight: 0.95,
    marginTop: "var(--s-2)",
    textTransform: "uppercase",
    textShadow: "0 8px 30px rgba(0,0,0,0.36)",
  },
  nowPlayingRule: {
    width: 42,
    height: 4,
    margin: "14px auto 0",
    borderRadius: "var(--r-pill)",
    background: "currentColor",
  },
  submissionError: {
    fontSize: "var(--t-body)",
    color: "#ff9b9b",
    textAlign: "center",
    fontWeight: 700,
  },
};
