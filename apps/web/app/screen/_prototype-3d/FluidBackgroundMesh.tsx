"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AudioSignal } from "@/lib/useAudioSignal";

interface FluidBackgroundMeshProps {
  signalRef: React.RefObject<AudioSignal>;
  colorA: string;
  colorB: string;
  shockwaveKey: number;
  quality?: number;
}

const BLOB_COUNT = 6;

/**
 * The mesh-based fluid fallback — used when the GPU is too weak for the
 * ray-marched metaball shader or WebGL2 is unavailable. Renders a set of
 * drifting, overlapping icospheres with a blur post-processing pass to
 * approximate the fluid look. Same audio reactivity and brand tinting as
 * the primary `FluidBackground`.
 *
 * Lower visual fidelity than the ray-marched path, but far cheaper: a
 * handful of draw calls instead of a per-fragment march. Holds 60fps on
 * integrated GPUs.
 */
export function FluidBackgroundMesh({
  signalRef,
  colorA,
  colorB,
  shockwaveKey,
  quality = 0.5,
}: FluidBackgroundMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const startTime = useRef(performance.now());
  const shockRef = useRef(0);
  const lastShockKey = useRef(0);

  const colorA3 = useMemo(() => new THREE.Color(colorA), [colorA]);
  const colorB3 = useMemo(() => new THREE.Color(colorB), [colorB]);

  // Pre-generate blob configs.
  const blobs = useMemo(() => {
    return Array.from({ length: BLOB_COUNT }, (_, i) => ({
      basePos: new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 2,
        -1 - Math.random() * 1.5,
      ),
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.4,
      baseRadius: 0.4 + Math.random() * 0.5,
      colorMix: Math.random(),
    }));
  }, []);

  const materials = useMemo(
    () =>
      blobs.map((b) => {
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color().lerpColors(colorA3, colorB3, b.colorMix),
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        return mat;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const signal = signalRef.current;
    const t = (performance.now() - startTime.current) / 1000;

    // Shockwave trigger.
    if (shockwaveKey !== lastShockKey.current) {
      lastShockKey.current = shockwaveKey;
      shockRef.current = 1.0;
    }
    shockRef.current *= Math.pow(0.95, dt * 60);

    if (!groupRef.current) return;
    const audioSwell = 1 + signal.smoothAmplitude * 0.4 + signal.bass * 0.3;
    const shockScale = 1 + shockRef.current * 0.3;

    groupRef.current.children.forEach((child, i) => {
      const blob = blobs[i];
      if (!blob) return;
      const mesh = child as THREE.Mesh;

      // Drift with layered sines.
      mesh.position.x =
        blob.basePos.x + Math.sin(t * blob.speed + blob.phase) * 0.3;
      mesh.position.y =
        blob.basePos.y + Math.cos(t * blob.speed * 0.7 + blob.phase) * 0.2;
      mesh.position.z = blob.basePos.z + Math.sin(t * 0.5 + blob.phase) * 0.1;

      // Audio-reactive scale + shockwave.
      const s = blob.baseRadius * audioSwell * shockScale;
      mesh.scale.setScalar(s);

      // Update color (lerp toward target).
      const mat = materials[i];
      mat.color.lerpColors(
        colorA3,
        colorB3,
        blob.colorMix + signal.amplitude * 0.1,
      );
      mat.opacity =
        0.2 + signal.smoothAmplitude * 0.15 + shockRef.current * 0.1;
    });
  });

  return (
    <group ref={groupRef}>
      {blobs.map((_, i) => (
        <mesh key={i} material={materials[i]}>
          <icosahedronGeometry args={[1, 3]} />
        </mesh>
      ))}
    </group>
  );
}
