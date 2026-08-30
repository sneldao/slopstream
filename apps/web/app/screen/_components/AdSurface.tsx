"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AudioSignal } from "@/lib/useAudioSignal";
import type { GenerationState } from "@/lib/streamReducer";
import type { ProductionTier, Segment } from "@slopstream/shared";

interface AdSurfaceProps {
  segment: Segment | null;
  generation: GenerationState | undefined;
  playingTier: ProductionTier | undefined;
  color: string;
  secondaryColor: string;
  signalRef: React.RefObject<AudioSignal>;
}

/**
 * The ad surface — a 3D object at center stage that evolves with the
 * production tier:
 *
 * - **Generating**: a pulsing orb with a loading shader (concentric rings).
 * - **Audio**: a glowing icosphere orb that pulses with the audio signal.
 * - **Audio + image**: a textured plane materializes at center; the orb
 *   sits behind it, still emitting ripples.
 * - **Video**: a video-textured plane at center.
 * - **Premium**: a larger plane with a subtle multi-plane parallax (future).
 *
 * The orb uses a custom shader: fresnel rim + audio-reactive displacement +
 * brand-color glow. When idle (no segment, no generation), a faint idle orb
 * breathes slowly so the scene is never empty.
 *
 * Image/video textures are loaded via R3F's `useLoader`. If a texture fails
 * to load (e.g. placeholder URLs in demo mode), the surface falls back to
 * the orb gracefully.
 */
export function AdSurface({
  segment,
  generation,
  playingTier,
  color,
  secondaryColor,
  signalRef,
}: AdSurfaceProps) {
  const isGenerating = !!generation;
  const isPlaying = !!segment && !isGenerating;
  const tier = generation?.tier ?? playingTier ?? "audio";
  const assetUrl = segment?.assetUrl;

  // Determine surface mode.
  const mode: SurfaceMode = isGenerating
    ? "generating"
    : isPlaying
      ? surfaceModeForTier(tier, assetUrl)
      : "idle";

  return (
    <group position={[0, 0, 0.3]}>
      {mode === "generating" && (
        <GeneratingOrb
          color={color}
          secondaryColor={secondaryColor}
          signalRef={signalRef}
          doneStages={generation?.doneStages ?? []}
        />
      )}
      {mode === "idle" && (
        <IdleOrb
          color={color}
          secondaryColor={secondaryColor}
          signalRef={signalRef}
        />
      )}
      {mode === "audio" && (
        <AudioOrb
          color={color}
          secondaryColor={secondaryColor}
          signalRef={signalRef}
        />
      )}
      {mode === "image" && assetUrl && (
        <ImagePlane url={assetUrl} color={color} signalRef={signalRef} />
      )}
      {mode === "video" && assetUrl && (
        <VideoPlane url={assetUrl} color={color} signalRef={signalRef} />
      )}
      {/* Always render the orb behind the plane for image/video tiers —
          it emits ripples that the plane sits in front of. */}
      {(mode === "image" || mode === "video") && (
        <AudioOrb
          color={color}
          secondaryColor={secondaryColor}
          signalRef={signalRef}
          behind
        />
      )}
      {/* Fallback orb when image/video texture fails to load. */}
      {(mode === "image" || mode === "video") && !assetUrl && (
        <AudioOrb
          color={color}
          secondaryColor={secondaryColor}
          signalRef={signalRef}
        />
      )}
    </group>
  );
}

type SurfaceMode = "idle" | "generating" | "audio" | "image" | "video";

function surfaceModeForTier(
  tier: ProductionTier,
  assetUrl?: string,
): SurfaceMode {
  if (!assetUrl) return "audio";
  const ext = assetUrl.split(".").pop()?.toLowerCase();
  if (ext === "mp4" || ext === "webm" || ext === "mov") return "video";
  if (
    ext === "jpg" ||
    ext === "jpeg" ||
    ext === "png" ||
    ext === "webp" ||
    ext === "gif"
  )
    return "image";
  // Unknown extension: fall back based on tier.
  if (tier === "video" || tier === "premium") return "video";
  if (tier === "audio_image") return "image";
  return "audio";
}

// --- Audio Orb --------------------------------------------------------------

interface OrbProps {
  color: string;
  secondaryColor: string;
  signalRef: React.RefObject<AudioSignal>;
  behind?: boolean;
}

function AudioOrb({ color, secondaryColor, signalRef, behind }: OrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const startTime = useRef(performance.now());

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmplitude: { value: 0 },
      uBeat: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uColorB: { value: new THREE.Color(secondaryColor) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    if (!matRef.current || !meshRef.current) return;
    const signal = signalRef.current;
    const dt = Math.min(delta, 1 / 30);
    const mat = matRef.current;

    mat.uniforms.uTime.value = (performance.now() - startTime.current) / 1000;
    mat.uniforms.uAmplitude.value = signal.smoothAmplitude;
    mat.uniforms.uBeat.value = signal.beat;
    mat.uniforms.uColor.value.lerp(
      new THREE.Color(color),
      1 - Math.exp(-dt / 0.15),
    );
    mat.uniforms.uColorB.value.lerp(
      new THREE.Color(secondaryColor),
      1 - Math.exp(-dt / 0.15),
    );

    // Pulse scale with amplitude.
    const pulse = 1 + signal.smoothAmplitude * 0.15 + signal.beat * 0.08;
    meshRef.current.scale.setScalar(pulse);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, behind ? -0.6 : 0]}>
      <icosahedronGeometry args={[0.45, 5]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={ORB_VERTEX}
        fragmentShader={ORB_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

// --- Idle Orb ---------------------------------------------------------------

function IdleOrb({ color, secondaryColor, signalRef }: OrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const startTime = useRef(performance.now());

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmplitude: { value: 0 },
      uBeat: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uColorB: { value: new THREE.Color(secondaryColor) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame(() => {
    if (!matRef.current || !meshRef.current) return;
    const signal = signalRef.current;
    matRef.current.uniforms.uTime.value =
      (performance.now() - startTime.current) / 1000;
    matRef.current.uniforms.uAmplitude.value = signal.smoothAmplitude * 0.3;
    matRef.current.uniforms.uBeat.value = signal.beat * 0.3;
    // Slow breathing.
    const breathe = 1 + Math.sin(performance.now() * 0.001) * 0.04;
    meshRef.current.scale.setScalar(breathe);
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[0.3, 4]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={ORB_VERTEX}
        fragmentShader={ORB_FRAGMENT}
        uniforms={uniforms}
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </mesh>
  );
}

// --- Generating Orb ---------------------------------------------------------

function GeneratingOrb({
  color,
  secondaryColor,
  signalRef,
  doneStages,
}: OrbProps & { doneStages: string[] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const startTime = useRef(performance.now());
  const stageCount = doneStages.length;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmplitude: { value: 0 },
      uBeat: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uColorB: { value: new THREE.Color(secondaryColor) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    if (!matRef.current || !meshRef.current) return;
    const signal = signalRef.current;
    const dt = Math.min(delta, 1 / 30);

    matRef.current.uniforms.uTime.value =
      (performance.now() - startTime.current) / 1000;
    matRef.current.uniforms.uAmplitude.value =
      0.3 + signal.smoothAmplitude * 0.2;
    matRef.current.uniforms.uBeat.value = signal.beat;
    matRef.current.uniforms.uColor.value.lerp(
      new THREE.Color(color),
      1 - Math.exp(-dt / 0.15),
    );

    // Faster pulse during generation.
    const t = performance.now() * 0.003;
    const pulse = 1 + Math.sin(t) * 0.08 + signal.beat * 0.05;
    meshRef.current.scale.setScalar(pulse);

    // Progress ring — expands and fades as stages complete.
    if (ringRef.current) {
      const ringPulse = (performance.now() * 0.001) % 1.5;
      const ringScale = 0.6 + ringPulse * 0.8;
      ringRef.current.scale.setScalar(ringScale);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.5 - ringPulse * 0.35) * (stageCount / 4);
    }
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.4, 5]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={ORB_VERTEX}
          fragmentShader={ORB_FRAGMENT}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
      {/* Progress ring — one per completed stage, expanding outward. */}
      {doneStages.map((_, i) => (
        <mesh
          key={i}
          ref={i === 0 ? ringRef : undefined}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.55, 0.58, 64]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// --- Image Plane ------------------------------------------------------------

function ImagePlane({
  url,
  color,
  signalRef,
}: {
  url: string;
  color: string;
  signalRef: React.RefObject<AudioSignal>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        setTexture(tex);
      },
      undefined,
      () => setFailed(true),
    );
  }, [url]);

  useFrame(() => {
    if (!meshRef.current) return;
    const signal = signalRef.current;
    // Subtle float + audio-reactive scale.
    const t = performance.now() * 0.001;
    meshRef.current.position.y = Math.sin(t * 0.8) * 0.03;
    const pulse = 1 + signal.smoothAmplitude * 0.04;
    meshRef.current.scale.setScalar(pulse);
  });

  if (failed || !texture) return null;

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1.6, 0.9]} />
      <meshBasicMaterial
        map={texture}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// --- Video Plane ------------------------------------------------------------

function VideoPlane({
  url,
  color,
  signalRef,
}: {
  url: string;
  color: string;
  signalRef: React.RefObject<AudioSignal>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = document.createElement("video");
    video.src = url;
    video.crossOrigin = "anonymous";
    video.loop = true;
    // Muted: the audio is played separately by useAudioSignal for the
    // fluid visualization. This avoids double audio and lets the audio
    // analyser drive the 3D scene.
    video.muted = true;
    video.playsInline = true;
    videoRef.current = video;

    video.addEventListener("loadeddata", () => {
      video.play().catch(() => setFailed(true));
      const tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      setTexture(tex);
    });
    video.addEventListener("error", () => setFailed(true));

    return () => {
      video.pause();
      video.src = "";
      videoRef.current = null;
    };
  }, [url]);

  useFrame(() => {
    if (!meshRef.current) return;
    const signal = signalRef.current;
    const t = performance.now() * 0.001;
    meshRef.current.position.y = Math.sin(t * 0.8) * 0.03;
    const pulse = 1 + signal.smoothAmplitude * 0.04;
    meshRef.current.scale.setScalar(pulse);
  });

  if (failed || !texture) return null;

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1.6, 0.9]} />
      <meshBasicMaterial
        map={texture}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// --- Orb Shaders ------------------------------------------------------------

const ORB_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uAmplitude;
uniform float uBeat;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vDistort;

// Simplex 3D noise (Ashima).
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

  float noise = snoise(position * 1.5 + uTime * 0.4);
  float distort = noise * (0.08 + uAmplitude * 0.12 + uBeat * 0.06);
  vDistort = distort;

  vec3 newPosition = position + normal * distort;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const ORB_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColorB;
uniform float uAmplitude;
uniform float uBeat;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vDistort;

void main() {
  // Fresnel rim — the energy glow at grazing angles.
  vec3 viewDir = normalize(cameraPosition - vPosition);
  float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.5);

  // Color blend — distortion shifts toward secondary.
  float colorMix = clamp(vDistort * 4.0 + 0.5, 0.0, 1.0);
  vec3 baseColor = mix(uColor, uColorB, colorMix);

  // Inner glow + fresnel rim + audio flash.
  vec3 color = baseColor * 0.4;
  color += baseColor * fresnel * 1.2;
  color += baseColor * uAmplitude * 0.5;
  color += vec3(1.0) * uBeat * 0.2;

  // Pulsing alpha — the orb feels alive.
  float alpha = 0.7 + fresnel * 0.3 + uAmplitude * 0.1;

  gl_FragColor = vec4(color, alpha);
}
`;
