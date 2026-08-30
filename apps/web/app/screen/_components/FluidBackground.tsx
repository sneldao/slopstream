"use client";

import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { METABALL_VERTEX, METABALL_FRAGMENT } from "./shaders/metaball.glsl";
import type { AudioSignal } from "@/lib/useAudioSignal";

interface FluidBackgroundProps {
  signalRef: React.RefObject<AudioSignal>;
  colorA: string;
  colorB: string;
  /** OUTBID shockwave trigger — increment to fire. */
  shockwaveKey: number;
  quality?: number;
}

/**
 * The fluid background — a full-screen plane running a ray-marched metaball
 * fragment shader. The fluid is always alive: drifting, morphing, breathing
 * with the audio signal. Tinted to the active brand's color palette.
 *
 * This replaces the Canvas 2D AmbientCanvas with a real 3D shader. One draw
 * call, one fragment shader, 60fps.
 *
 * Color transitions (e.g. the OUTBID flood from the displaced leader's
 * palette to the new leader's) are lerped over ~600ms rather than snapped,
 * so the palette "floods" through the metaball field. The lerp is
 * frame-rate independent (exponential approach toward the target).
 */
export function FluidBackground({
  signalRef,
  colorA,
  colorB,
  shockwaveKey,
  quality = 1.0,
}: FluidBackgroundProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();
  const startTime = useRef(performance.now());
  const shockStrength = useRef(0);
  const lastShockKey = useRef(0);

  // Target colors (hex → THREE.Color). The uniforms lerp toward these.
  const targetColorA = useMemo(() => new THREE.Color(colorA), [colorA]);
  const targetColorB = useMemo(() => new THREE.Color(colorB), [colorB]);

  // Uniforms — updated every frame.
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmplitude: { value: 0 },
      uBeat: { value: 0 },
      uBass: { value: 0 },
      uTreble: { value: 0 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
      uShockwave: { value: 0 },
      uShockCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uQuality: { value: quality },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Update uniforms each frame.
  useFrame((_, delta) => {
    if (!materialRef.current) return;
    const mat = materialRef.current;
    const signal = signalRef.current;
    const dt = Math.min(delta, 1 / 30);

    mat.uniforms.uTime.value = (performance.now() - startTime.current) / 1000;
    mat.uniforms.uAmplitude.value = signal.amplitude;
    mat.uniforms.uBeat.value = signal.beat;
    mat.uniforms.uBass.value = signal.bass;
    mat.uniforms.uTreble.value = signal.treble;

    // Color flood — exponential approach toward the target palette.
    // tau ≈ 0.15s → ~95% complete in ~0.45s, ~99% in ~0.7s. This is the
    // OUTBID "paint washes across the screen" moment.
    const tau = 0.15;
    const k = 1 - Math.exp(-dt / tau);
    mat.uniforms.uColorA.value.lerp(targetColorA, k);
    mat.uniforms.uColorB.value.lerp(targetColorB, k);

    // Update resolution (handles resize).
    mat.uniforms.uResolution.value.set(size.width, size.height);

    // Shockwave — triggered by shockwaveKey increment, decays over ~1s.
    if (shockwaveKey !== lastShockKey.current) {
      lastShockKey.current = shockwaveKey;
      shockStrength.current = 1.0;
    }
    shockStrength.current *= Math.pow(0.96, dt * 60); // frame-rate independent decay
    mat.uniforms.uShockwave.value = shockStrength.current;
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={METABALL_VERTEX}
        fragmentShader={METABALL_FRAGMENT}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}
