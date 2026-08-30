"use client";

import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { AudioSignal } from "@/lib/useAudioSignal";
import type {
  AttentionState,
  ClearBurst,
  GenerationState,
} from "@/lib/streamReducer";
import type {
  BrandSummary,
  LeaderboardEntry,
  ProductionTier,
  Segment,
} from "@slopstream/shared";
import {
  continuumAssetType,
  selectSceneRecipe,
  type SceneRecipe,
} from "@/lib/continuumScene";

interface SceneProps {
  signalRef: React.RefObject<AudioSignal>;
  colorA: string;
  colorB: string;
  shockwaveKey: number;
  quality?: number;
  leaderboard: LeaderboardEntry[];
  brandById: Record<string, BrandSummary>;
  outbidFlashId: number;
  outbidDisplacedBrandId?: string;
  outbidNewBrandId?: string;
  segment: Segment | null;
  recentSegments: Segment[];
  generation: GenerationState | undefined;
  playingTier: ProductionTier | undefined;
  attention: AttentionState | undefined;
  lastClear: ClearBurst | undefined;
  fallbackBrandColor: string;
  fallbackSecondaryColor: string;
  fallbackBurstKey: number;
  fallbackBurstFromColor?: string;
  fallbackBurstToColor?: string;
}

interface ArchiveItem {
  id: string;
  assetUrl?: string;
  summary: string;
  brandName: string;
  primary: string;
  secondary: string;
}

interface SceneErrorState {
  failed: boolean;
}

const PLATFORM_ORBS = [
  ["7%", "18%", "clamp(78px, 10vw, 170px)", "var(--slop-coral)", "-3s", "0.24"],
  [
    "26%",
    "82%",
    "clamp(90px, 13vw, 220px)",
    "var(--slop-blue)",
    "-11s",
    "0.52",
  ],
  ["48%", "9%", "clamp(52px, 7vw, 110px)", "var(--slop-lime)", "-7s", "0.18"],
  [
    "71%",
    "78%",
    "clamp(115px, 16vw, 270px)",
    "var(--slop-yellow)",
    "-16s",
    "0.68",
  ],
  [
    "91%",
    "22%",
    "clamp(88px, 12vw, 190px)",
    "var(--slop-violet)",
    "-5s",
    "0.42",
  ],
  ["97%", "65%", "clamp(44px, 6vw, 90px)", "var(--slop-coral)", "-13s", "0.12"],
] as const;

const ARCHIVE_POSITIONS: Record<
  SceneRecipe,
  readonly { left: string; top: string; rotate: string; scale: number }[]
> = {
  editorial: [
    { left: "4%", top: "49%", rotate: "-8deg", scale: 0.72 },
    { left: "68%", top: "7%", rotate: "7deg", scale: 0.66 },
    { left: "76%", top: "57%", rotate: "-4deg", scale: 0.58 },
    { left: "19%", top: "4%", rotate: "5deg", scale: 0.48 },
    { left: "54%", top: "74%", rotate: "3deg", scale: 0.44 },
  ],
  orbit: [
    { left: "8%", top: "16%", rotate: "-14deg", scale: 0.52 },
    { left: "73%", top: "9%", rotate: "10deg", scale: 0.6 },
    { left: "77%", top: "62%", rotate: "-8deg", scale: 0.54 },
    { left: "6%", top: "68%", rotate: "7deg", scale: 0.46 },
    { left: "44%", top: "78%", rotate: "-2deg", scale: 0.4 },
  ],
  cascade: [
    { left: "69%", top: "5%", rotate: "6deg", scale: 0.62 },
    { left: "75%", top: "34%", rotate: "-3deg", scale: 0.55 },
    { left: "70%", top: "63%", rotate: "5deg", scale: 0.48 },
    { left: "8%", top: "66%", rotate: "-8deg", scale: 0.42 },
    { left: "50%", top: "76%", rotate: "2deg", scale: 0.38 },
  ],
  constellation: [
    { left: "2%", top: "28%", rotate: "-5deg", scale: 0.5 },
    { left: "78%", top: "20%", rotate: "8deg", scale: 0.46 },
    { left: "69%", top: "69%", rotate: "-7deg", scale: 0.44 },
    { left: "16%", top: "72%", rotate: "4deg", scale: 0.4 },
    { left: "43%", top: "5%", rotate: "-2deg", scale: 0.35 },
  ],
  cinema: [
    { left: "2%", top: "18%", rotate: "-8deg", scale: 0.36 },
    { left: "80%", top: "15%", rotate: "7deg", scale: 0.34 },
    { left: "83%", top: "70%", rotate: "-4deg", scale: 0.3 },
    { left: "5%", top: "72%", rotate: "5deg", scale: 0.28 },
    { left: "48%", top: "82%", rotate: "0deg", scale: 0.26 },
  ],
};

type WorldStyle = CSSProperties & {
  "--world-a": string;
  "--world-b": string;
};

type OrbStyle = CSSProperties & {
  "--orb-x": string;
  "--orb-y": string;
  "--orb-size": string;
  "--orb-color": string;
  "--orb-delay": string;
  "--orb-z": string;
};

/** A living editorial archive built from media, type and physical colour. */
export function Scene(props: SceneProps) {
  return (
    <SceneBoundary fallback={<ContinuumFallback {...props} />}>
      <ContinuumWorld {...props} />
    </SceneBoundary>
  );
}

function ContinuumWorld(props: SceneProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previousSegment = useRef<Segment | null>(null);
  const [sessionArchive, setSessionArchive] = useState<ArchiveItem[]>([]);

  useEffect(() => {
    const previous = previousSegment.current;
    if (previous && previous.id !== props.segment?.id) {
      const brand = previous.brandId
        ? props.brandById[previous.brandId]
        : undefined;
      const item: ArchiveItem = {
        id: previous.id,
        assetUrl: previous.assetUrl,
        summary: previous.summary,
        brandName: brand?.name ?? "Open frequency",
        primary: brand?.primaryColor ?? "#ff5c58",
        secondary: brand?.secondaryColor ?? "#ffe45e",
      };
      setSessionArchive((items) =>
        [item, ...items.filter((i) => i.id !== item.id)].slice(0, 5),
      );
    }
    previousSegment.current = props.segment;
  }, [props.segment, props.brandById]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = event.clientX / window.innerWidth - 0.5;
        const y = event.clientY / window.innerHeight - 0.5;
        root.style.setProperty("--continuum-x", `${x * 24}px`);
        root.style.setProperty("--continuum-y", `${y * 24}px`);
        root.style.setProperty("--continuum-x-reverse", `${x * -18}px`);
        root.style.setProperty("--continuum-y-reverse", `${y * -18}px`);
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const tick = () => {
      const signal = props.signalRef.current;
      root.style.setProperty(
        "--continuum-pulse",
        (1 + signal.smoothAmplitude * 0.045 + signal.beat * 0.025).toFixed(3),
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [props.signalRef]);

  const activeBrand = props.segment?.brandId
    ? props.brandById[props.segment.brandId]
    : props.generation?.brandId
      ? props.brandById[props.generation.brandId]
      : undefined;

  const archive = useMemo(() => {
    const persisted = props.recentSegments.map((segment) =>
      toArchiveItem(segment, props.brandById),
    );
    return [...sessionArchive, ...persisted]
      .filter(
        (item, index, items) =>
          item.id !== props.segment?.id &&
          items.findIndex((candidate) => candidate.id === item.id) === index,
      )
      .slice(0, 5);
  }, [
    props.recentSegments,
    props.brandById,
    props.segment?.id,
    sessionArchive,
  ]);

  const recipe = useMemo(
    () =>
      selectSceneRecipe({
        segmentId: props.segment?.id,
        assetUrl: props.segment?.assetUrl,
        generationId: props.generation?.segmentId,
        latestArchiveId: props.recentSegments[0]?.id,
      }),
    [props.segment, props.generation, props.recentSegments],
  );

  return (
    <div
      ref={rootRef}
      className={`continuum-world continuum-world--recipe-${recipe}${props.segment ? " continuum-world--focus" : ""}`}
      style={
        { "--world-a": props.colorA, "--world-b": props.colorB } as WorldStyle
      }
      aria-hidden="true"
    >
      <div className="continuum-world__wash" />
      <div className="continuum-world__grid" />
      <div className="continuum-world__type continuum-world__type--one">
        ATTENTION&nbsp; IS&nbsp; MOVING&nbsp; ATTENTION&nbsp; IS&nbsp; MOVING
      </div>
      <div className="continuum-world__type continuum-world__type--two">
        PROOF / PLAY / REWARD / REPEAT / PROOF / PLAY / REWARD / REPEAT
      </div>
      <svg
        className="continuum-world__route"
        viewBox="0 0 1600 900"
        preserveAspectRatio="none"
      >
        <path d="M-40 720 C 220 410, 390 930, 650 510 S 1040 100, 1240 390 S 1510 760, 1680 280" />
      </svg>

      <div className="continuum-world__archive">
        {archive.map((item, index) => (
          <ArchiveCard
            key={item.id}
            item={item}
            index={index}
            recipe={recipe}
          />
        ))}
      </div>

      <ActivePortal
        key={props.segment?.id ?? props.generation?.segmentId ?? "open"}
        segment={props.segment}
        generation={props.generation}
        brand={activeBrand}
        color={props.colorA}
      />

      <div className="continuum-world__orbs">
        {PLATFORM_ORBS.map(([x, y, size, color, delay, depth], index) => (
          <i
            className="continuum-orb"
            key={`${x}-${y}`}
            style={
              {
                "--orb-x": x,
                "--orb-y": y,
                "--orb-size": size,
                "--orb-color": color,
                "--orb-delay": delay,
                "--orb-z": `${Number(depth) * 130}px`,
              } as OrbStyle
            }
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
          </i>
        ))}
        {props.leaderboard.slice(0, 3).map((entry, index) => {
          const brand = props.brandById[entry.brandId];
          return (
            <i
              className="continuum-orb continuum-orb--bid"
              key={entry.brandId}
              style={
                {
                  "--orb-x": `${16 + index * 31}%`,
                  "--orb-y": `${24 + ((index + 1) % 2) * 53}%`,
                  "--orb-size": `clamp(${44 + index * 8}px, ${5 + index * 1.2}vw, ${92 + index * 14}px)`,
                  "--orb-color": brand?.primaryColor ?? props.colorA,
                  "--orb-delay": `${-4 - index * 5}s`,
                  "--orb-z": `${(0.2 + index * 0.15) * 130}px`,
                } as OrbStyle
              }
            >
              <span>{index + 1}</span>
            </i>
          );
        })}
      </div>

      {(props.shockwaveKey > 0 || props.lastClear) && (
        <div
          className="continuum-ripple"
          key={`${props.shockwaveKey}-${props.lastClear?.burstId ?? 0}`}
        >
          <i />
          <i />
          <i />
        </div>
      )}

      {props.attention && (
        <div
          className="continuum-world__proof-glow"
          style={{
            opacity: Math.min(
              0.72,
              0.12 + props.attention.verifiedCount / props.attention.threshold,
            ),
          }}
        />
      )}
    </div>
  );
}

function ActivePortal({
  segment,
  generation,
  brand,
  color,
}: {
  segment: Segment | null;
  generation: GenerationState | undefined;
  brand: BrandSummary | undefined;
  color: string;
}) {
  return (
    <div
      className="continuum-portal"
      key={segment?.id ?? generation?.segmentId ?? "open"}
    >
      <div className="continuum-portal__halo" style={{ background: color }} />
      <div className="continuum-portal__frame">
        {segment ? (
          <MediaAsset segment={segment} brand={brand} />
        ) : generation ? (
          <div className="continuum-portal__generating">
            <span>ASSEMBLING</span>
            <strong>{brand?.name ?? "THE NEXT MOMENT"}</strong>
            <div>
              {["SCRIPT", "VOICE", "IMAGE", "VIDEO"].map((label, index) => (
                <i
                  className={
                    generation.doneStages.length > index ? "is-done" : ""
                  }
                  key={label}
                >
                  {label}
                </i>
              ))}
            </div>
          </div>
        ) : (
          <div className="continuum-portal__open">
            <span>THE CONTINUUM / LIVE</span>
            <strong>
              SLOP
              <br />
              <em>STREAM</em>
            </strong>
            <small>Every moment leaves a trace.</small>
          </div>
        )}
      </div>
      <span className="continuum-portal__index">
        CURRENT
        <br />
        FREQUENCY
      </span>
    </div>
  );
}

function MediaAsset({
  segment,
  brand,
}: {
  segment: Segment;
  brand?: BrandSummary;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [segment.assetUrl]);
  const mediaType = useMemo(
    () => continuumAssetType(segment.assetUrl),
    [segment.assetUrl],
  );

  if (!segment.assetUrl || failed || mediaType === "audio") {
    return (
      <div
        className="continuum-portal__editorial"
        style={{
          background: `linear-gradient(135deg, ${brand?.primaryColor ?? "#45a7ff"}, ${brand?.secondaryColor ?? "#b8ff65"})`,
        }}
      >
        <span>NOW PLAYING</span>
        <strong>{brand?.name ?? "OPEN STREAM"}</strong>
        <p>{segment.summary || "A new signal entering the Continuum."}</p>
      </div>
    );
  }

  if (mediaType === "video") {
    return (
      <video
        className="continuum-portal__media"
        src={segment.assetUrl}
        autoPlay
        muted
        loop
        playsInline
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    // Generated asset URLs are dynamic and cannot use next/image host allowlists.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="continuum-portal__media"
      src={segment.assetUrl}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

function ArchiveCard({
  item,
  index,
  recipe,
}: {
  item: ArchiveItem;
  index: number;
  recipe: SceneRecipe;
}) {
  const positions = ARCHIVE_POSITIONS[recipe];
  const position = positions[index % positions.length];
  return (
    <div
      className="continuum-memory"
      style={
        {
          left: position.left,
          top: position.top,
          rotate: position.rotate,
          scale: position.scale,
          "--memory-a": item.primary,
          "--memory-b": item.secondary,
        } as CSSProperties
      }
    >
      <span>ARCHIVE {String(index + 1).padStart(2, "0")}</span>
      {item.assetUrl && continuumAssetType(item.assetUrl) === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.assetUrl} alt="" />
      ) : (
        <strong>{item.brandName}</strong>
      )}
      <small>{item.summary || "Previously on this frequency"}</small>
    </div>
  );
}

function toArchiveItem(
  segment: Segment,
  brandById: Record<string, BrandSummary>,
): ArchiveItem {
  const brand = segment.brandId ? brandById[segment.brandId] : undefined;
  return {
    id: segment.id,
    assetUrl: segment.assetUrl,
    summary: segment.summary,
    brandName: brand?.name ?? "Open frequency",
    primary: brand?.primaryColor ?? "#45a7ff",
    secondary: brand?.secondaryColor ?? "#ffe45e",
  };
}

function ContinuumFallback(props: SceneProps) {
  return (
    <div
      className="continuum-world continuum-world--fallback"
      style={
        {
          "--world-a": props.fallbackBrandColor,
          "--world-b": props.fallbackSecondaryColor,
        } as WorldStyle
      }
    />
  );
}

class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  SceneErrorState
> {
  state: SceneErrorState = { failed: false };

  static getDerivedStateFromError(): SceneErrorState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error(
      "[Continuum] scene failed, using a static colour field:",
      error,
    );
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
