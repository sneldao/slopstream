"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AudioSignal } from "@/lib/useAudioSignal";
import type { AttentionState } from "@/lib/streamReducer";

interface ThresholdBasinProps {
  attention: AttentionState | undefined;
  color: string;
  secondaryColor: string;
  signalRef: React.RefObject<AudioSignal>;
}

const BASIN_RADIUS = 0.45;
const BASIN_HEIGHT = 0.7;
const BASIN_Y = -1.0;

/**
 * A 3D glass basin at the bottom center of the scene that fills with
 * brand-colored fluid. The fill level is driven by
 * `attention.verifiedCount / attention.threshold`. The fluid surface has
 * wave physics (vertex shader displacement). When the threshold is met,
 * the fluid glows brightly.
 *
 * The basin itself is a transparent cylinder (glass). The fluid inside is
 * a shorter cylinder whose height scales with the fill level, with a
 * custom shader for the surface waves + brand-color glow.
 *
 * When no attention state is active, the basin is empty and dim.
 */
export function ThresholdBasin({
  attention,
  color,
  secondaryColor,
  signalRef,
}: ThresholdBasinProps) {
  const fillRef = useRef(0); // smoothed fill level 0..1
  const fluidMeshRef = useRef<THREE.Mesh>(null);
  const fluidMatRef = useRef<THREE.ShaderMaterial>(null);
  const glassMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const startTime = useRef(performance.now());

  const targetFill = attention
    ? Math.min(1, attention.verifiedCount / attention.threshold)
    : 0;
  const isCleared = targetFill >= 1;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmplitude: { value: 0 },
      uFill: { value: 0 },
      uCleared: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uColorB: { value: new THREE.Color(secondaryColor) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const signal = signalRef.current;

    // Smooth the fill level toward the target.
    const k = 1 - Math.exp(-dt / 0.3);
    fillRef.current += (targetFill - fillRef.current) * k;

    if (fluidMatRef.current) {
      const mat = fluidMatRef.current;
      mat.uniforms.uTime.value = (performance.now() - startTime.current) / 1000;
      mat.uniforms.uAmplitude.value = signal.smoothAmplitude;
      mat.uniforms.uFill.value = fillRef.current;
      mat.uniforms.uCleared.value +=
        (isCleared ? 1 : 0 - mat.uniforms.uCleared.value) * k;
      mat.uniforms.uColor.value.lerp(new THREE.Color(color), k);
      mat.uniforms.uColorB.value.lerp(new THREE.Color(secondaryColor), k);
    }

    // Scale the fluid mesh height with fill level.
    if (fluidMeshRef.current) {
      const fill = fillRef.current;
      const h = Math.max(0.001, fill * BASIN_HEIGHT);
      fluidMeshRef.current.scale.y = h / BASIN_HEIGHT;
      fluidMeshRef.current.position.y = BASIN_Y - BASIN_HEIGHT / 2 + h / 2;
    }
  });

  return (
    <group position={[0, BASIN_Y, 0.3]}>
      {/* Glass basin — transparent cylinder with fresnel. */}
      <mesh>
        <cylinderGeometry
          args={[BASIN_RADIUS, BASIN_RADIUS, BASIN_HEIGHT, 32, 1, true]}
        />
        <meshPhysicalMaterial
          ref={glassMatRef}
          transparent
          opacity={0.15}
          roughness={0}
          transmission={0.9}
          thickness={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Basin rim — a thin ring at the top for definition. */}
      <mesh position={[0, BASIN_HEIGHT / 2, 0]}>
        <torusGeometry args={[BASIN_RADIUS, 0.015, 8, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          depthWrite={false}
        />
      </mesh>

      {/* Fluid — a cylinder that fills from the bottom. */}
      <mesh ref={fluidMeshRef} position={[0, -BASIN_HEIGHT / 2, 0]}>
        <cylinderGeometry
          args={[BASIN_RADIUS * 0.96, BASIN_RADIUS * 0.96, BASIN_HEIGHT, 32, 8]}
        />
        <shaderMaterial
          ref={fluidMatRef}
          vertexShader={FLUID_VERTEX}
          fragmentShader={FLUID_FRAGMENT}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// --- Fluid shaders ----------------------------------------------------------

const FLUID_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uAmplitude;
uniform float uFill;

varying vec3 vNormal;
varying vec2 vUv;
varying float vWave;

// Simple wave displacement on the top surface.
void main() {
  vNormal = normal;
  vUv = uv;

  // Only displace the top portion of the cylinder.
  float topMask = smoothstep(0.85, 1.0, uv.y);
  float wave = sin(uv.x * 20.0 + uTime * 3.0) * cos(uv.y * 15.0 + uTime * 2.0);
  wave *= uAmplitude * 0.02 + 0.005;
  vWave = wave * topMask * uFill;

  vec3 newPosition = position;
  newPosition.y += vWave;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const FLUID_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColorB;
uniform float uFill;
uniform float uCleared;
uniform float uAmplitude;

varying vec3 vNormal;
varying vec2 vUv;
varying float vWave;

void main() {
  // Color blend — fill level shifts from secondary to primary.
  vec3 baseColor = mix(uColorB, uColor, uFill);

  // Surface highlight from the wave displacement.
  float highlight = vWave * 20.0 + 0.5;
  baseColor += vec3(highlight) * 0.1;

  // Glow when cleared — the fluid lights up.
  baseColor += uColor * uCleared * 0.5;
  baseColor += vec3(1.0) * uCleared * 0.15;

  // Audio reactivity — amplitude brightens the fluid.
  baseColor += uColor * uAmplitude * 0.2;

  // Alpha — more opaque when full.
  float alpha = 0.6 + uFill * 0.3 + uCleared * 0.1;

  gl_FragColor = vec4(baseColor, alpha);
}
`;
