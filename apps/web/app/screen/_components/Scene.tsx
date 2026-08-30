"use client";

import { Component, useState, useEffect, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { FluidBackground } from "./FluidBackground";
import { FluidBackgroundMesh } from "./FluidBackgroundMesh";
import { BrandBlobField } from "./BrandBlobField";
import { AdSurface } from "./AdSurface";
import { ThresholdBasin } from "./ThresholdBasin";
import { ClearingStreams } from "./ClearingStreams";
import { AmbientCanvas } from "./AmbientCanvas";
import type { AudioSignal } from "@/lib/useAudioSignal";
import type {
  LeaderboardEntry,
  BrandSummary,
  ProductionTier,
  Segment,
} from "@slopstream/shared";
import type {
  GenerationState,
  AttentionState,
  ClearBurst,
} from "@/lib/streamReducer";

interface SceneProps {
  signalRef: React.RefObject<AudioSignal>;
  colorA: string;
  colorB: string;
  shockwaveKey: number;
  /** Fluid shader quality 0..1 (controls march steps + metaball count). */
  quality?: number;
  // Brand blobs
  leaderboard: LeaderboardEntry[];
  brandById: Record<string, BrandSummary>;
  outbidFlashId: number;
  outbidDisplacedBrandId?: string;
  outbidNewBrandId?: string;
  // Ad surface (Phase 4)
  segment: Segment | null;
  generation: GenerationState | undefined;
  playingTier: ProductionTier | undefined;
  // Threshold basin (Phase 5)
  attention: AttentionState | undefined;
  // Clearing streams (Phase 5)
  lastClear: ClearBurst | undefined;
  // Brand palette for the Canvas 2D fallback.
  fallbackBrandColor: string;
  fallbackSecondaryColor: string;
  fallbackBurstKey: number;
  fallbackBurstFromColor?: string;
  fallbackBurstToColor?: string;
}

interface SceneErrorState {
  failed: boolean;
}

/**
 * The 3D scene — a full-viewport R3F Canvas rendering the fluid background,
 * brand blobs, the ad surface, the threshold basin, and clearing streams.
 *
 * Capability detection at mount selects between the ray-marched metaball
 * shader (primary, WebGL2) and the mesh-based fallback (FluidBackgroundMesh,
 * weaker GPUs). If WebGL entirely fails, the error boundary falls back to
 * the Canvas 2D `AmbientCanvas`.
 *
 * Must be loaded with `dynamic(() => import(...), { ssr: false })`.
 */
export function Scene(props: SceneProps) {
  return (
    <SceneBoundary fallback={<SceneFallback {...props} />}>
      <SceneInner {...props} />
    </SceneBoundary>
  );
}

function SceneInner(props: SceneProps) {
  const [useShader, setUseShader] = useState<boolean | null>(null);

  // Capability detection — check for WebGL2 and a reasonable texture unit
  // count. If WebGL2 is unavailable, fall back to the mesh path.
  useEffect(() => {
    try {
      const testCanvas = document.createElement("canvas");
      const gl2 = testCanvas.getContext("webgl2");
      if (!gl2) {
        setUseShader(false);
        return;
      }
      const units = gl2.getParameter(gl2.MAX_TEXTURE_IMAGE_UNITS);
      // Below 16 units → very weak GPU; use mesh fallback.
      setUseShader(units >= 16);
    } catch {
      setUseShader(false);
    }
  }, []);

  // Still detecting — render nothing (the canvas mounts after detection).
  if (useShader === null) return null;

  return (
    <Canvas
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      }}
      dpr={[1, 1]}
      camera={{ position: [0, 0, 3], fov: 60, near: 0.1, far: 20 }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {/* Lighting for the glass basin (MeshPhysicalMaterial needs it). */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[2, 3, 2]} intensity={0.6} />
      <pointLight position={[-2, -1, 1]} intensity={0.3} color={props.colorA} />

      {/* Fluid background — ray-marched or mesh fallback. */}
      {useShader ? (
        <FluidBackground
          signalRef={props.signalRef}
          colorA={props.colorA}
          colorB={props.colorB}
          shockwaveKey={props.shockwaveKey}
          quality={props.quality}
        />
      ) : (
        <FluidBackgroundMesh
          signalRef={props.signalRef}
          colorA={props.colorA}
          colorB={props.colorB}
          shockwaveKey={props.shockwaveKey}
          quality={props.quality}
        />
      )}

      {/* Brand blobs — kinematic Rapier bodies. */}
      <BrandBlobField
        leaderboard={props.leaderboard}
        brandById={props.brandById}
        outbidFlashId={props.outbidFlashId}
        outbidDisplacedBrandId={props.outbidDisplacedBrandId}
        outbidNewBrandId={props.outbidNewBrandId}
        signalRef={props.signalRef}
      />

      {/* Ad surface — the 3D stage (orb / image plane / video plane). */}
      <AdSurface
        segment={props.segment}
        generation={props.generation}
        playingTier={props.playingTier}
        color={props.colorA}
        secondaryColor={props.colorB}
        signalRef={props.signalRef}
      />

      {/* Threshold basin — 3D glass container that fills with brand fluid. */}
      {props.attention && (
        <ThresholdBasin
          attention={props.attention}
          color={props.colorA}
          secondaryColor={props.colorB}
          signalRef={props.signalRef}
        />
      )}

      {/* Clearing streams — particle burst on bid clear (80/20 split). */}
      <ClearingStreams burst={props.lastClear} color={props.colorA} />

      <EffectComposer>
        <Bloom
          intensity={0.4}
          luminanceThreshold={0.6}
          luminanceSmoothing={0.2}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}

function SceneFallback({
  signalRef,
  fallbackBrandColor,
  fallbackSecondaryColor,
  fallbackBurstKey,
  fallbackBurstFromColor,
  fallbackBurstToColor,
}: SceneProps) {
  return (
    <AmbientCanvas
      signalRef={signalRef}
      brandColor={fallbackBrandColor}
      secondaryColor={fallbackSecondaryColor}
      burstKey={fallbackBurstKey}
      burstFromColor={fallbackBurstFromColor}
      burstToColor={fallbackBurstToColor}
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
    console.error("[Scene] 3D scene failed, falling back to Canvas 2D:", error);
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
