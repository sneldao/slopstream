"use client";

import { motion, AnimatePresence } from "framer-motion";
import type {
  BrandSummary,
  GenerationStage,
  PublicChallenge,
  Segment,
} from "@slopstream/shared";
import type { GenerationState } from "@/lib/streamReducer";

const STAGES: GenerationStage[] = ["script", "voice", "image", "video"];

/**
 * Crisp broadcast labels over the Continuum. Media and generative states
 * live in the world itself; this layer supplies only useful context.
 */
export function NowPlaying({
  nowPlaying,
  nowPlayingStartedAt,
  brand,
  generation,
  activeChallenge,
  encore = false,
  nextSlotPriceUsd = 0,
}: {
  nowPlaying: Segment | null;
  nowPlayingStartedAt?: string;
  brand: BrandSummary | undefined;
  generation: GenerationState | undefined;
  activeChallenge: PublicChallenge | undefined;
  encore?: boolean;
  signalRef: React.RefObject<unknown>;
  /** Current ask for the next slot — lets free slots sell the auction. */
  nextSlotPriceUsd?: number;
}) {
  const primary = brand?.primaryColor;

  return (
    <div style={styles.stage}>
      <AnimatePresence mode="wait">
        {/* nowPlaying first: encores run while the next segment generates,
            and segment.playing clears generation so live flow is unchanged. */}
        {nowPlaying ? (
          <PlayingLabels
            key="play"
            segment={nowPlaying}
            brand={brand}
            startedAt={nowPlayingStartedAt}
            encore={encore}
            isFree={nowPlaying.brandId === null}
            nextSlotPriceUsd={nextSlotPriceUsd}
          />
        ) : generation ? (
          <GenerationLabels key="gen" generation={generation} brand={brand} />
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
      <div style={styles.emptyKicker}>The market is open</div>
      {/* Plain pitch — what this is, who pays, who gets paid. */}
      <div style={styles.emptyPitch}>
        Companies bid live for ad slots on this channel.
      </div>
      <div style={styles.emptySub}>
        Every bid is public, every view is verified on-chain, and verified
        viewers get paid from every cleared bid.
      </div>
      <div style={styles.emptyPulse}>
        <i className="empty-pulse__dot" /> Waiting for the first bid
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
      <div style={styles.genBrand}>{brand?.name}</div>
      <div style={styles.genStages} aria-label="Generating ad">
        {STAGES.map((key) => {
          const done = generation.doneStages.includes(key);
          return (
            <motion.i
              key={key}
              style={{
                ...styles.genDot,
                background: done ? primary : "rgba(16,16,20,0.18)",
              }}
              animate={done ? { scale: [1.6, 1] } : {}}
              transition={{ type: "spring", stiffness: 300, damping: 16 }}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

function PlayingLabels({
  brand,
  startedAt,
  encore = false,
  isFree = false,
  nextSlotPriceUsd = 0,
}: {
  segment: Segment;
  brand: BrandSummary | undefined;
  startedAt?: string;
  encore?: boolean;
  /** Free scraped-filler slot — deliberately austere; sells the auction. */
  isFree?: boolean;
  nextSlotPriceUsd?: number;
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
        style={{
          ...styles.adBadge,
          ...(isFree ? styles.adBadgeFree : {}),
        }}
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {encore ? "ENCORE" : isFree ? "FREE SLOT — NOBODY PAID" : "NOW PLAYING"}
      </motion.div>
      <motion.div
        style={{
          ...styles.adBrand,
          ...(isFree ? styles.adBrandFree : {}),
        }}
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
      {/* Free slots sell the auction instead of pretending to be premium. */}
      {isFree ? (
        <div style={styles.adFreeNote}>
          Nobody paid for this slot
          {nextSlotPriceUsd > 0
            ? ` — the next one starts at $${nextSlotPriceUsd.toFixed(0)}`
            : ""}
          . Bid to take it.
        </div>
      ) : (
        startedAt && (
          <div style={styles.adTime}>
            live · {new Date(startedAt).toLocaleTimeString()}
          </div>
        )
      )}
    </motion.div>
  );
}

function ChallengeBanner({ brandColor }: { brandColor: string | undefined }) {
  // Spectators see only a quiet availability signal. Questions and answers
  // stay on /listen for people who explicitly enable Earn Mode.
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
      <i style={{ ...styles.challengeDot, background: brandColor }} />
      <div>
        <div style={styles.challengeHeader}>EARN CHECK AVAILABLE</div>
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
    position: "fixed",
    left: "clamp(18px, 3vw, 42px)",
    bottom: "clamp(94px, 14vh, 150px)",
    textAlign: "left",
    display: "flex",
    alignItems: "flex-start",
    flexDirection: "column",
    maxWidth: 330,
  },
  emptyKicker: {
    marginBottom: 18,
    color: "var(--slop-ink)",
    fontSize: "clamp(9px, 1vw, 12px)",
    fontWeight: 900,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  emptySub: {
    maxWidth: 330,
    fontSize: "clamp(14px, 1.8vw, 22px)",
    color: "rgba(16,16,20,0.68)",
    marginTop: 0,
    fontWeight: 650,
    lineHeight: 1.25,
  },
  emptyPitch: {
    fontSize: "clamp(22px, 3.2vw, 40px)",
    fontWeight: 900,
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
    color: "var(--slop-ink)",
  },
  emptyPulse: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
    padding: "8px 13px",
    border: "1px solid rgba(16,16,20,0.2)",
    borderRadius: 999,
    background: "rgba(244,241,232,0.76)",
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
    color: "var(--slop-ink)",
  },
  genBrand: {
    fontSize: "clamp(18px, 2.6vw, 32px)",
    fontWeight: 700,
    color: "rgba(16,16,20,0.62)",
    position: "relative",
  },
  genStages: {
    display: "flex",
    gap: 10,
    marginTop: 4,
    position: "relative",
    justifyContent: "center",
  },
  genDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
  },
  adContent: {
    position: "fixed",
    left: "clamp(18px, 3vw, 42px)",
    bottom: "clamp(94px, 14vh, 150px)",
    maxWidth: 360,
    zIndex: 2,
    textAlign: "left",
  },
  adBadge: {
    fontSize: 13,
    letterSpacing: 3,
    fontWeight: 800,
    color: "rgba(16,16,20,0.66)",
    background: "rgba(244,241,232,0.78)",
    border: "1px solid rgba(16,16,20,0.2)",
    padding: "4px 12px",
    borderRadius: 999,
    marginBottom: 16,
    display: "inline-block",
  },
  adBrand: {
    fontSize: "clamp(30px, 4vw, 58px)",
    fontWeight: 900,
    color: "var(--slop-ink)",
    fontFamily: "var(--slop-display)",
    letterSpacing: "-0.04em",
    lineHeight: 0.9,
  },
  adChapter: {
    marginTop: 12,
    fontSize: "clamp(13px, 1.6vw, 18px)",
    fontWeight: 800,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "var(--slop-ink)",
  },
  adBlurb: {
    maxWidth: 520,
    margin: "10px 0 0",
    fontSize: "clamp(14px, 1.5vw, 18px)",
    fontWeight: 650,
    lineHeight: 1.35,
    color: "rgba(16,16,20,0.66)",
  },
  adTime: { fontSize: 12, color: "rgba(16,16,20,0.5)", marginTop: 8 },
  adBadgeFree: {
    color: "rgba(16,16,20,0.55)",
    background: "rgba(16,16,20,0.06)",
    border: "1px dashed rgba(16,16,20,0.3)",
  },
  adBrandFree: {
    color: "rgba(16,16,20,0.45)",
    fontSize: "clamp(24px, 3vw, 44px)",
    fontWeight: 800,
  },
  adFreeNote: {
    marginTop: 10,
    maxWidth: 520,
    fontSize: "clamp(13px, 1.4vw, 17px)",
    fontWeight: 700,
    lineHeight: 1.35,
    color: "rgba(16,16,20,0.6)",
  },
  challenge: {
    position: "absolute",
    top: "clamp(72px, 10vh, 104px)",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(244,241,232,0.86)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(16,16,20,0.22)",
    borderRadius: 999,
    padding: "9px 14px",
    zIndex: 30,
    boxShadow: "3px 4px 0 rgba(16,16,20,0.14)",
  },
  challengeHeader: {
    color: "var(--slop-ink)",
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: 900,
  },
  challengeDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    boxShadow: "0 0 16px currentColor",
  },
  challengeHint: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: 700,
    color: "rgba(16,16,20,0.54)",
  },
};
