"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  BrandSummary,
  GenerationStage,
  PublicChallenge,
  Segment,
} from "@slopstream/shared";
import type { GenerationState } from "@/lib/streamReducer";
import type { AudioSignal } from "@/lib/useAudioSignal";

const STAGES: { key: GenerationStage; label: string }[] = [
  { key: "script", label: "Script" },
  { key: "voice", label: "Voice" },
  { key: "image", label: "Image" },
  { key: "video", label: "Video" },
];

/**
 * The now-playing area: full-screen ad while playing, the generation
 * sequence while generating, and the challenge banner overlay.
 *
 * The playing ad has an audio-reactive background canvas that pulses with
 * the shared audio signal — the room feels the stream. Previous segments
 * recede behind the current ad with perspective + blur (spatial depth).
 */
export function NowPlaying({
  nowPlaying,
  nowPlayingStartedAt,
  brand,
  generation,
  activeChallenge,
  signalRef,
}: {
  nowPlaying: Segment | null;
  nowPlayingStartedAt?: string;
  brand: BrandSummary | undefined;
  generation: GenerationState | undefined;
  activeChallenge: PublicChallenge | undefined;
  signalRef: React.RefObject<AudioSignal>;
}) {
  const primary = brand?.primaryColor;

  return (
    <div style={styles.stage}>
      <AnimatePresence mode="wait">
        {generation ? (
          <GenerationSequence key="gen" generation={generation} brand={brand} />
        ) : nowPlaying ? (
          <PlayingAd
            key="play"
            segment={nowPlaying}
            brand={brand}
            startedAt={nowPlayingStartedAt}
            signalRef={signalRef}
          />
        ) : (
          <EmptyMarket key="empty" />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeChallenge && (
          <ChallengeBanner
            key={activeChallenge.id}
            challenge={activeChallenge}
            brandColor={primary}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyMarket() {
  return (
    <motion.div
      style={styles.empty}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        style={styles.emptyTitle}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        SLOPSTREAM
      </motion.div>
      <div style={styles.emptySub}>
        The world&apos;s first live attention market.
      </div>
    </motion.div>
  );
}

function GenerationSequence({
  generation,
  brand,
}: {
  generation: GenerationState;
  brand: BrandSummary | undefined;
}) {
  const primary = brand?.primaryColor ?? "#888";
  return (
    <motion.div
      style={styles.gen}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
    >
      <motion.div
        style={{
          ...styles.genOrb,
          background: `radial-gradient(circle, ${primary}, transparent 70%)`,
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <div style={styles.genTitle}>GENERATING AD…</div>
      <div style={styles.genBrand}>{brand?.name}</div>
      <div style={styles.genStages}>
        {STAGES.map((s) => {
          const done = generation.doneStages.includes(s.key);
          return (
            <motion.div
              key={s.key}
              style={{
                ...styles.genStage,
                borderColor: done ? primary : "rgba(255,255,255,0.2)",
              }}
              animate={
                done
                  ? {
                      scale: [1.2, 1],
                      backgroundColor: "rgba(255,255,255,0.06)",
                    }
                  : {}
              }
              transition={{ type: "spring", stiffness: 300, damping: 16 }}
            >
              <span
                style={{ color: done ? primary : "var(--platform-text-dim)" }}
              >
                {done ? "✓" : "·"} {s.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

function PlayingAd({
  segment,
  brand,
  startedAt,
  signalRef,
}: {
  segment: Segment;
  brand: BrandSummary | undefined;
  startedAt?: string;
  signalRef: React.RefObject<AudioSignal>;
}) {
  const primary = brand?.primaryColor ?? "#444";
  const secondary = brand?.secondaryColor ?? "#222";
  const bgRef = useRef<HTMLCanvasElement>(null);

  // Audio-reactive background canvas — pulses with the signal.
  useEffect(() => {
    const canvas = bgRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      const signal = signalRef.current;
      const amp = signal.smoothAmplitude;
      const beat = signal.beat;

      ctx.clearRect(0, 0, w, h);

      // Audio-reactive radial gradient — the background breathes.
      const pulseRadius = 0.4 + amp * 0.3 + beat * 0.15;
      const cx = w / 2;
      const cy = h * 0.4;
      const maxR = Math.max(w, h);
      const grad = ctx.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        maxR * pulseRadius,
      );
      grad.addColorStop(0, hexA(primary, 0.5 + amp * 0.3));
      grad.addColorStop(0.4, hexA(secondary, 0.3 + amp * 0.15));
      grad.addColorStop(1, "rgba(5, 5, 15, 0.95)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Beat ripple — expanding ring on each beat.
      if (beat > 0.5) {
        ctx.strokeStyle = hexA(primary, beat * 0.3);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * 0.3 * (1 - beat), 0, Math.PI * 2);
        ctx.stroke();
      }

      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [primary, secondary, signalRef]);

  return (
    <motion.div
      style={styles.ad}
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 120, damping: 22 }}
    >
      <canvas ref={bgRef} width={1920} height={1080} style={styles.adCanvas} />

      {/* Spatial depth — receding previous segment ghosts. */}
      <RecedingSegments brand={brand} />

      <div style={styles.adContent}>
        <motion.div
          style={styles.adBadge}
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          NOW PLAYING
        </motion.div>
        <motion.div
          style={styles.adBrand}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            delay: 0.3,
            type: "spring",
            stiffness: 200,
            damping: 16,
          }}
        >
          {brand?.name ?? "Free Ad"}
        </motion.div>
        <div style={styles.adSegment}>segment {segment.id}</div>
        {startedAt && (
          <div style={styles.adTime}>
            live · {new Date(startedAt).toLocaleTimeString()}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Receding segment ghosts — the Continuum trail behind the current ad. */
function RecedingSegments({ brand }: { brand: BrandSummary | undefined }) {
  // In demo mode we don't have real previous segments, so we render
  // abstract receding cards tinted to the brand color — the visual
  // suggestion of depth and history. With real data these would be
  // actual previous segment thumbnails.
  const primary = brand?.primaryColor ?? "#333";
  const secondary = brand?.secondaryColor ?? "#222";

  return (
    <div style={styles.receding}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            ...styles.recedingCard,
            transform: `translateZ(${-100 - i * 80}px) scale(${1 - i * 0.1})`,
            opacity: 0.15 - i * 0.04,
            background: `linear-gradient(135deg, ${hexA(secondary, 0.3)}, ${hexA(primary, 0.2)})`,
            filter: `blur(${2 + i * 2}px)`,
          }}
        />
      ))}
    </div>
  );
}

function ChallengeBanner({
  challenge,
  brandColor,
}: {
  challenge: PublicChallenge;
  brandColor: string | undefined;
}) {
  return (
    <motion.div
      style={styles.challenge}
      initial={{ y: 60, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 40, opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 18 }}
    >
      <div style={styles.challengeHeader}>
        <span style={{ color: brandColor ?? "#fff" }}>👀 ATTENTION CHECK</span>
      </div>
      <div style={styles.challengeQuestion}>{challenge.question}</div>
      {challenge.options && (
        <div style={styles.challengeOptions}>
          {challenge.options.map((o) => (
            <div key={o} style={styles.challengeOption}>
              {o}
            </div>
          ))}
        </div>
      )}
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

const styles: Record<string, React.CSSProperties> = {
  stage: {
    position: "relative",
    flex: 1,
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    perspective: 1000,
  },
  empty: { textAlign: "center" },
  emptyTitle: {
    fontSize: "clamp(40px, 8vw, 110px)",
    fontWeight: 900,
    letterSpacing: 8,
    color: "#fff",
    textShadow: "0 6px 40px rgba(0,0,0,0.5)",
  },
  emptySub: {
    fontSize: "clamp(16px, 2.4vw, 28px)",
    color: "var(--platform-text-dim)",
    marginTop: 12,
    fontWeight: 600,
  },
  gen: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    position: "relative",
  },
  genOrb: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: "50%",
    top: -120,
    filter: "blur(20px)",
  },
  genTitle: {
    fontSize: "clamp(28px, 5vw, 64px)",
    fontWeight: 900,
    letterSpacing: 4,
    color: "#fff",
    position: "relative",
  },
  genBrand: {
    fontSize: "clamp(18px, 2.6vw, 32px)",
    fontWeight: 700,
    color: "var(--platform-text-dim)",
    position: "relative",
  },
  genStages: {
    display: "flex",
    gap: 12,
    marginTop: 8,
    position: "relative",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  genStage: {
    padding: "8px 16px",
    borderRadius: 12,
    border: "2px solid",
    fontWeight: 700,
    fontSize: 15,
  },
  ad: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    transformStyle: "preserve-3d",
  },
  adCanvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  receding: {
    position: "absolute",
    inset: 0,
    transformStyle: "preserve-3d",
    pointerEvents: "none",
  },
  recedingCard: {
    position: "absolute",
    inset: "10%",
    borderRadius: 24,
    transformStyle: "preserve-3d",
  },
  adContent: {
    position: "relative",
    zIndex: 2,
    textAlign: "center",
  },
  adBadge: {
    fontSize: 13,
    letterSpacing: 3,
    fontWeight: 800,
    color: "rgba(255,255,255,0.7)",
    background: "rgba(0,0,0,0.3)",
    padding: "4px 12px",
    borderRadius: 999,
    marginBottom: 16,
    display: "inline-block",
  },
  adBrand: {
    fontSize: "clamp(36px, 7vw, 96px)",
    fontWeight: 900,
    color: "#fff",
    textShadow: "0 6px 40px rgba(0,0,0,0.5)",
  },
  adSegment: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    marginTop: 8,
    fontVariantNumeric: "tabular-nums",
  },
  adTime: { fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 },
  challenge: {
    position: "absolute",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(560px, 90%)",
    background: "rgba(10,10,26,0.78)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 18,
    padding: "18px 22px",
    zIndex: 30,
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  challengeHeader: {
    fontSize: 13,
    letterSpacing: 2,
    fontWeight: 800,
    marginBottom: 8,
  },
  challengeQuestion: {
    fontSize: "clamp(18px, 2.4vw, 26px)",
    fontWeight: 700,
    color: "#fff",
    marginBottom: 14,
  },
  challengeOptions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  challengeOption: {
    padding: "10px 14px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.08)",
    fontWeight: 600,
    fontSize: 15,
    color: "#fff",
  },
};
