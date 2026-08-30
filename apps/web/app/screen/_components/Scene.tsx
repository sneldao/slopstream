"use client";

import { Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { FluidBackground } from "./FluidBackground";
import { BrandBlobField } from "./BrandBlobField";
import { AmbientCanvas } from "./AmbientCanvas";
import type { AudioSignal } from "@/lib/useAudioSignal";
import type { LeaderboardEntry, BrandSummary } from "@slopstream/shared";

interface SceneProps {
  signalRef: React.RefObject<AudioSignal>;
  colorA: string;
  colorB: string;
  shockwaveKey: number;
  /** Fluid shader quality 0..1 (controls march steps + metaball count). */
  quality?: number;
  // Brand blobs (Phase 3)
  leaderboard: LeaderboardEntry[];
  brandById: Record<string, BrandSummary>;
  outbidFlashId: number;
  outbidDisplacedBrandId?: string;
  outbidNewBrandId?: string;
  /** Brand palette for the Canvas 2D fallback. */
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
 * The 3D scene — a full-viewport R3F Canvas rendering the fluid background
 * and brand blobs.
 *
 * The fluid is a ray-marched metaball shader (Phase 1). Brand blobs are
 * kinematic Rapier rigid bodies with organic distorted meshes (Phase 3). The
 * leader is at center, largest, glowing; others recede behind into the fluid.
 *
 * Must be loaded with `dynamic(() => import(...), { ssr: false })` to avoid
 * Next.js SSR issues with WebGL.
 *
 * Wrapped in an error boundary: if WebGL initialization or the R3F tree
 * throws (e.g. no WebGL2 context, shader compile failure on a weak GPU),
 * the scene degrades to the existing Canvas 2D `AmbientCanvas` so the demo
 * never shows a blank screen. This is the Phase 7 fallback path, wired early
 * for demo safety.
 */
export function Scene(props: SceneProps) {
  return (
    <SceneBoundary fallback={<SceneFallback {...props} />}>
      <SceneInner {...props} />
    </SceneBoundary>
  );
}

function SceneInner({
  signalRef,
  colorA,
  colorB,
  shockwaveKey,
  quality = 1.0,
  leaderboard,
  brandById,
  outbidFlashId,
  outbidDisplacedBrandId,
  outbidNewBrandId,
}: SceneProps) {
  return (
    <Canvas
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      }}
      // Cap dpr at 1 for the demo — the metaball shader is fragment-heavy
      // (up to 64 march steps × 8 balls × 4 normal taps per fragment) and
      // rendering at >1 dpr on a retina/integrated GPU will not hold 60fps.
      // Visual fidelity at dpr 1 is still strong; this is the single most
      // effective demo-safety lever.
      dpr={[1, 1]}
      camera={{ position: [0, 0, 3], fov: 60, near: 0.1, far: 20 }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <FluidBackground
        signalRef={signalRef}
        colorA={colorA}
        colorB={colorB}
        shockwaveKey={shockwaveKey}
        quality={quality}
      />
      <BrandBlobField
        leaderboard={leaderboard}
        brandById={brandById}
        outbidFlashId={outbidFlashId}
        outbidDisplacedBrandId={outbidDisplacedBrandId}
        outbidNewBrandId={outbidNewBrandId}
        signalRef={signalRef}
      />
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

/**
 * Canvas 2D fallback — the existing AmbientCanvas particle layer. Shown when
 * the 3D scene fails to initialize. Shares the same audio signal and brand
 * palette so the room still feels alive.
 */
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
