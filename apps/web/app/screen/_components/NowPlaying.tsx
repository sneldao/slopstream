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
 * The now-playing area: full-screen ad while playing, the generation sequence
 * while generating, and the challenge banner when a challenge is active.
 * Previous segments recede behind the current ad (spatial depth is a P1
 * refinement; here the receding trail is implied by the canvas).
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
          />
        ) : (
          <EmptyMarket key="empty" />
        )}
      </AnimatePresence>

      {/* Challenge banner overlays the ad. */}
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
      <div style={styles.emptyTitle}>SLOPSTREAM</div>
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
                      backgroundColor: `rgba(255,255,255,0.06)`,
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
}: {
  segment: Segment;
  brand: BrandSummary | undefined;
  startedAt?: string;
}) {
  const primary = brand?.primaryColor ?? "#444";
  const secondary = brand?.secondaryColor ?? "#222";
  return (
    <motion.div
      style={{
        ...styles.ad,
        background: `radial-gradient(120% 120% at 50% 40%, ${secondary}, ${primary} 60%, #05050f 110%)`,
      }}
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 120, damping: 22 }}
    >
      <div style={styles.adBadge}>NOW PLAYING</div>
      <div style={styles.adBrand}>{brand?.name ?? "Free Ad"}</div>
      <div style={styles.adSegment}>segment {segment.id}</div>
      {startedAt && (
        <div style={styles.adTime}>
          live · {new Date(startedAt).toLocaleTimeString()}
        </div>
      )}
    </motion.div>
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

const styles: Record<string, React.CSSProperties> = {
  stage: {
    position: "relative",
    flex: 1,
    minHeight: 320,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
    borderRadius: 24,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
