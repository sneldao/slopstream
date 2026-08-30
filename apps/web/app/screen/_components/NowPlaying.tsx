"use client";

import { motion, AnimatePresence } from "framer-motion";
import type {
  BrandSummary,
  GenerationStage,
  PublicChallenge,
  Segment,
} from "@slopstream/shared";
import type { GenerationState } from "@/lib/streamReducer";

const STAGES: { key: GenerationStage; label: string }[] = [
  { key: "script", label: "Script" },
  { key: "voice", label: "Voice" },
  { key: "image", label: "Image" },
  { key: "video", label: "Video" },
];

/**
 * The now-playing text overlay — brand name, generation stage labels, and
 * the challenge banner. This is a thin HTML layer floating over the 3D
 * canvas; the visual ad surface (orb / image plane / video plane) is
 * rendered by `AdSurface` inside the 3D scene.
 *
 * The 2D canvas background, receding segment ghosts, and generation orb
 * that lived here in the first overhaul are now 3D — this component keeps
 * only the text elements that are clearer as crisp HTML than as 3D text.
 */
export function NowPlaying({
  nowPlaying,
  nowPlayingStartedAt,
  brand,
  generation,
  activeChallenge,
}: {
  nowPlaying: Segment | null;
  nowPlayingStartedAt?: string;
  brand: BrandSummary | undefined;
  generation: GenerationState | undefined;
  activeChallenge: PublicChallenge | undefined;
  signalRef: React.RefObject<unknown>;
}) {
  const primary = brand?.primaryColor;

  return (
    <div style={styles.stage}>
      <AnimatePresence mode="wait">
        {generation ? (
          <GenerationLabels key="gen" generation={generation} brand={brand} />
        ) : nowPlaying ? (
          <PlayingLabels
            key="play"
            segment={nowPlaying}
            brand={brand}
            startedAt={nowPlayingStartedAt}
          />
        ) : (
          <EmptyMarket key="empty" />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeChallenge && (
          <ChallengeBanner key={activeChallenge.id} brandColor={primary} />
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
      <div style={styles.emptyKicker}>
        Open frequency · waiting for the next bid
      </div>
      <motion.h1
        style={styles.emptyTitle}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <span style={styles.emptyTitleSolid}>SLOP</span>
        <span style={styles.emptyTitleOutline}>STREAM</span>
      </motion.h1>
      <div style={styles.emptySub}>
        Attention is moving. The next brand can own the moment.
      </div>
      <div style={styles.emptyPulse}>
        <i className="empty-pulse__dot" /> Market open
      </div>
    </motion.div>
  );
}

function GenerationLabels({
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

function PlayingLabels({
  segment,
  brand,
  startedAt,
}: {
  segment: Segment;
  brand: BrandSummary | undefined;
  startedAt?: string;
}) {
  return (
    <motion.div
      style={styles.adContent}
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 120, damping: 22 }}
    >
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
    </motion.div>
  );
}

function ChallengeBanner({ brandColor }: { brandColor: string | undefined }) {
  // Spectators must not see the question or options — answers stay on /listen.
  return (
    <motion.div
      style={styles.challenge}
      initial={{ y: 60, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 40, opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 18 }}
      role="status"
      aria-live="polite"
    >
      <div style={styles.challengeHeader}>
        <span style={{ color: brandColor ?? "#fff" }}>👀 ATTENTION CHECK</span>
      </div>
      <div style={styles.challengeQuestion}>In progress on listener phones</div>
      <div style={styles.challengeHint}>
        Scan the QR to prove you were here.
      </div>
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  stage: {
    position: "relative",
    flex: 1,
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  empty: {
    textAlign: "center",
    display: "flex",
    alignItems: "center",
    flexDirection: "column",
    maxWidth: "min(86vw, 1100px)",
  },
  emptyKicker: {
    marginBottom: 18,
    color: "var(--slop-yellow)",
    fontSize: "clamp(9px, 1vw, 12px)",
    fontWeight: 900,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  emptyTitle: {
    display: "flex",
    margin: 0,
    flexDirection: "column",
    fontFamily: "var(--slop-display)",
    fontSize: "clamp(74px, 12vw, 180px)",
    fontWeight: 900,
    letterSpacing: "-0.06em",
    lineHeight: 0.7,
    color: "#fff",
    textShadow: "0 12px 50px rgba(0,0,0,0.45)",
  },
  emptyTitleSolid: {
    transform: "translateX(-0.18em)",
  },
  emptyTitleOutline: {
    transform: "translateX(0.16em)",
    color: "transparent",
    WebkitTextStroke: "2px rgba(255,255,255,0.9)",
  },
  emptySub: {
    maxWidth: 480,
    fontSize: "clamp(14px, 1.8vw, 22px)",
    color: "rgba(255,255,255,0.72)",
    marginTop: 34,
    fontWeight: 650,
    lineHeight: 1.25,
  },
  emptyPulse: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
    padding: "8px 13px",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 999,
    background: "rgba(8,8,18,0.5)",
    backdropFilter: "blur(12px)",
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  gen: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    position: "relative",
  },
  genTitle: {
    fontSize: "clamp(28px, 5vw, 64px)",
    fontWeight: 900,
    letterSpacing: 4,
    color: "#fff",
    position: "relative",
    textShadow: "0 4px 30px rgba(0,0,0,0.6)",
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
    pointerEvents: "auto",
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
  challengeHint: {
    fontSize: 13,
    fontWeight: 600,
    color: "rgba(255,255,255,0.55)",
  },
};
