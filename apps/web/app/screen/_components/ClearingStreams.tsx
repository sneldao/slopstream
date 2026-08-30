"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ClearBurst } from "@/lib/streamReducer";

interface ClearingStreamsProps {
  burst: ClearBurst | undefined;
  color: string;
}

const PARTICLE_COUNT = 120;
const BASIN_POS: [number, number, number] = [0, -1.0, 0.3];
const LISTENER_POOL_POS: [number, number, number] = [-1.3, -0.4, 0.3];
const PLATFORM_POOL_POS: [number, number, number] = [1.3, -0.4, 0.3];

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number; // 1 → 0 (fades out)
  color: THREE.Color;
  size: number;
}

/**
 * Particle streams that burst from the threshold basin when a bid clears.
 * The gross amount splits 80/20: 80% flows as brand-colored particles toward
 * the listener reward pool (left), 20% as neutral-white particles toward the
 * platform pool (right).
 *
 * Particles are rendered as instanced small spheres — GPU-friendly, no
 * texture needed. Each particle has a position, velocity, and life. They
 * arc from the basin toward their target pool with gravity, then fade.
 *
 * Triggered by `burst.burstId` changing. When no burst is active, the
 * component renders nothing (the instanced mesh is hidden).
 */
export function ClearingStreams({ burst, color }: ClearingStreamsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const particlesRef = useRef<Particle[]>([]);
  const lastBurstId = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const brandColor = useMemo(() => new THREE.Color(color), [color]);
  const neutralColor = useMemo(() => new THREE.Color("#ffd76a"), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const dt = Math.min(delta, 1 / 30);
    const mesh = meshRef.current;

    // Spawn particles on new burst.
    if (burst && burst.burstId !== lastBurstId.current && burst.burstId > 0) {
      lastBurstId.current = burst.burstId;
      spawnParticles(particlesRef.current, burst, brandColor, neutralColor);
    }

    const particles = particlesRef.current;
    let visibleCount = 0;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.life <= 0) continue;

      // Physics — gravity + drag.
      p.vel.y -= 1.5 * dt;
      p.vel.multiplyScalar(1 - 0.5 * dt);
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt * 0.6; // ~1.6s lifetime

      // Set instance transform.
      dummy.position.copy(p.pos);
      const s = p.size * Math.max(0, p.life);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(visibleCount, dummy.matrix);
      mesh.setColorAt(visibleCount, p.color);
      visibleCount++;
    }

    mesh.count = visibleCount;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, PARTICLE_COUNT]}
      frustumCulled={false}
    >
      <sphereGeometry args={[0.025, 8, 8]} />
      <meshBasicMaterial
        transparent
        opacity={0.85}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function spawnParticles(
  particles: Particle[],
  burst: ClearBurst,
  brandColor: THREE.Color,
  neutralColor: THREE.Color,
) {
  // Clear old particles.
  particles.length = 0;

  const listenerCount = Math.round(PARTICLE_COUNT * 0.8);
  const platformCount = PARTICLE_COUNT - listenerCount;
  const origin = new THREE.Vector3(...BASIN_POS);
  origin.y += 0.35; // top of basin

  // 80% → listener pool (brand-colored).
  for (let i = 0; i < listenerCount; i++) {
    const target = new THREE.Vector3(...LISTENER_POOL_POS);
    const spread = 0.15;
    target.x += (Math.random() - 0.5) * spread;
    target.y += (Math.random() - 0.5) * spread;

    const dir = target.clone().sub(origin).normalize();
    const speed = 1.5 + Math.random() * 1.5;
    // Add upward bias for an arc.
    const vel = dir.multiplyScalar(speed);
    vel.y += 1.0 + Math.random() * 0.8;

    particles.push({
      pos: origin
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
            0,
          ),
        ),
      vel,
      life: 0.8 + Math.random() * 0.4,
      color: brandColor
        .clone()
        .lerp(new THREE.Color("#ffffff"), Math.random() * 0.3),
      size: 0.8 + Math.random() * 0.6,
    });
  }

  // 20% → platform pool (neutral gold).
  for (let i = 0; i < platformCount; i++) {
    const target = new THREE.Vector3(...PLATFORM_POOL_POS);
    const spread = 0.12;
    target.x += (Math.random() - 0.5) * spread;
    target.y += (Math.random() - 0.5) * spread;

    const dir = target.clone().sub(origin).normalize();
    const speed = 1.5 + Math.random() * 1.5;
    const vel = dir.multiplyScalar(speed);
    vel.y += 1.0 + Math.random() * 0.8;

    particles.push({
      pos: origin
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
            0,
          ),
        ),
      vel,
      life: 0.8 + Math.random() * 0.4,
      color: neutralColor.clone(),
      size: 0.6 + Math.random() * 0.4,
    });
  }
}
