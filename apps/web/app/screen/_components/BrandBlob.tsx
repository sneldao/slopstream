"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  RigidBody,
  type RapierRigidBody,
  BallCollider,
} from "@react-three/rapier";
import * as THREE from "three";
import type { AudioSignal } from "@/lib/useAudioSignal";

interface BrandBlobProps {
  brandId: string;
  color: string;
  secondaryColor: string;
  rank: number;
  isLeader: boolean;
  /** Target position in 3D space — the blob springs toward this. */
  targetPosition: [number, number, number];
  /** OUTBID flash id — increments on each outbid event. */
  outbidFlashId: number;
  /** Brand id of the displaced (former leader) blob on this outbid. */
  outbidDisplacedBrandId?: string;
  /** Impulse direction — typically from new leader toward displaced blob. */
  impulseDirection?: [number, number, number];
  signalRef: React.RefObject<AudioSignal>;
}

/**
 * A brand blob — a kinematic Rapier rigid body with an organic distorted
 * icosphere mesh. The leader is at center, largest, glowing. Others recede
 * behind, smaller, with depth.
 *
 * Position is driven by a manual critically-damped spring toward
 * `targetPosition` (set by leaderboard rank). This is more stable than
 * applying impulses every frame: kinematic bodies are moved directly via
 * `setNextKinematicTranslation`, so there is no integrator to fight and no
 * mass-dependent overshoot.
 *
 * On OUTBID, the displaced blob gets a one-shot velocity kick in
 * `impulseDirection` — a physical shove out of center that the spring then
 * recovers from. Each blob compares its own `brandId` against
 * `outbidDisplacedBrandId`, so the impulse fires exactly once per outbid on
 * the right blob, independent of render timing.
 */
export function BrandBlob({
  brandId,
  color,
  secondaryColor,
  rank,
  isLeader,
  targetPosition,
  outbidFlashId,
  outbidDisplacedBrandId,
  impulseDirection = [1, 0, 0],
  signalRef,
}: BrandBlobProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const startTime = useRef(performance.now());
  const lastFlashId = useRef(0);

  // Manual spring state — current position + velocity in world space.
  // Initialized to the target so the blob doesn't lurch on mount.
  const posRef = useRef(new THREE.Vector3(...targetPosition));
  const velRef = useRef(new THREE.Vector3());

  // Scale: leader is largest, others shrink with rank (clamped, never
  // negative — a negative scale inverts the mesh).
  const scale = Math.max(0.15, isLeader ? 1.0 : 0.7 - rank * 0.08);
  const radius = 0.35 * scale;

  // Distortion shader — vertex displacement for organic blob surface.
  const distortUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmplitude: { value: 0 },
      uDistort: { value: 0.15 + (isLeader ? 0.05 : 0) },
      uColor: { value: new THREE.Color(color) },
      uColorB: { value: new THREE.Color(secondaryColor) },
      uEmissive: { value: isLeader ? 0.4 : 0.15 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Target as a Vector3 for fast spring math.
  const targetVec = useMemo(
    () => new THREE.Vector3(...targetPosition),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetPosition[0], targetPosition[1], targetPosition[2]],
  );

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    const dt = Math.min(delta, 1 / 30); // clamp dt for stability after stalls

    // Audio-reactive distortion uniforms.
    if (materialRef.current) {
      const signal = signalRef.current;
      const mat = materialRef.current;
      mat.uniforms.uTime.value = (performance.now() - startTime.current) / 1000;
      mat.uniforms.uAmplitude.value =
        signal.smoothAmplitude * 0.3 + signal.beat * 0.2;
      // Keep colors in sync when the brand palette changes (was a useMemo
      // side effect — moved here so it runs every frame deterministically).
      mat.uniforms.uColor.value.set(color);
      mat.uniforms.uColorB.value.set(secondaryColor);
    }

    // OUTBID impulse — fire once when flashId changes AND this blob is the
    // displaced one. Adds an instantaneous velocity kick; the spring then
    // recovers the blob toward its (new, demoted) target.
    if (
      outbidFlashId !== lastFlashId.current &&
      outbidFlashId > 0 &&
      outbidDisplacedBrandId === brandId
    ) {
      lastFlashId.current = outbidFlashId;
      const impulseStrength = 4;
      velRef.current.x += impulseDirection[0] * impulseStrength;
      velRef.current.y += impulseDirection[1] * impulseStrength;
      velRef.current.z += impulseDirection[2] * impulseStrength;
    } else if (outbidFlashId !== lastFlashId.current) {
      // Acknowledge the flash on non-displaced blobs so we don't replay it
      // later if they ever match the displaced id.
      lastFlashId.current = outbidFlashId;
    }

    // Critically-damped spring toward the target. a = -k*x - c*v with
    // c = 2*sqrt(k) for critical damping. Frame-rate independent via dt.
    const k = 60;
    const c = 2 * Math.sqrt(k);
    const pos = posRef.current;
    const vel = velRef.current;

    const ax = -k * (pos.x - targetVec.x) - c * vel.x;
    const ay = -k * (pos.y - targetVec.y) - c * vel.y;
    const az = -k * (pos.z - targetVec.z) - c * vel.z;

    vel.x += ax * dt;
    vel.y += ay * dt;
    vel.z += az * dt;
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    pos.z += vel.z * dt;

    // Drive the kinematic body. setNextKinematicTranslation is consumed by
    // the next physics step; this is the supported way to move kinematic
    // bodies in @react-three/rapier.
    body.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z });
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      position={targetPosition}
      colliders={false}
      enabledRotations={[false, false, false]}
    >
      <BallCollider args={[radius]} />
      <mesh scale={scale}>
        <icosahedronGeometry args={[0.35, 4]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={BLOB_VERTEX}
          fragmentShader={BLOB_FRAGMENT}
          uniforms={distortUniforms}
          transparent
        />
      </mesh>
    </RigidBody>
  );
}

// --- Blob shaders -----------------------------------------------------------

const BLOB_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uAmplitude;
uniform float uDistort;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vDistort;

// Simplex 3D noise — classic Ashima implementation.
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
  vNormal = normal;
  vPosition = position;

  // Vertex displacement — 3D noise driven by time + audio.
  float noise = snoise(position * 2.0 + uTime * 0.3);
  float distort = noise * (uDistort + uAmplitude * 0.15);
  vDistort = distort;

  vec3 newPosition = position + normal * distort;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const BLOB_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColorB;
uniform float uEmissive;
uniform float uAmplitude;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vDistort;

void main() {
  // Lighting — simple lambert + fresnel rim.
  vec3 lightDir = normalize(vec3(0.5, 0.7, 0.8));
  float lambert = max(dot(vNormal, lightDir), 0.0);
  float fresnel = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.0);

  // Color blend — distortions shift toward secondary color.
  float colorMix = clamp(vDistort * 3.0 + 0.5, 0.0, 1.0);
  vec3 baseColor = mix(uColor, uColorB, colorMix);

  vec3 color = baseColor * (0.3 + lambert * 0.5);
  color += baseColor * uEmissive;
  color += baseColor * fresnel * 0.6;
  color += baseColor * uAmplitude * 0.3;

  gl_FragColor = vec4(color, 0.92);
}
`;
