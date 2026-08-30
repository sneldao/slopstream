"use client";

import { useEffect, useRef } from "react";
import type { AudioSignal } from "@/lib/useAudioSignal";

/**
 * The ambient particle layer — the living canvas's persistent soul.
 *
 * A full-bleed canvas behind all content that renders drifting, brand-tinted
 * metaball-like blobs. They drift slowly, react to the audio signal
 * (swelling on beats, shifting hue with amplitude), and respond to the
 * OUTBID flash (a burst of particles from the displaced brand's color to
 * the new leader's color).
 *
 * This is not event-triggered — it's always running. The room feels alive
 * even when nothing is happening. When events fire, the layer reacts.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  hue: number;
  alpha: number;
  life: number; // 1 for ambient, <1 for burst particles that fade
  burst: boolean;
}

interface Props {
  signalRef: React.RefObject<AudioSignal>;
  brandColor: string;
  secondaryColor: string;
  /** Increment to trigger an OUTBID burst. */
  burstKey: number;
  burstFromColor?: string;
  burstToColor?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(full.slice(0, 2), 16) || 255,
    parseInt(full.slice(2, 4), 16) || 255,
    parseInt(full.slice(4, 6), 16) || 255,
  ];
}

export function AmbientCanvas({
  signalRef,
  brandColor,
  secondaryColor,
  burstKey,
  burstFromColor,
  burstToColor,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const burstKeyRef = useRef(0);
  const colorsRef = useRef({ brand: brandColor, secondary: secondaryColor });

  // Track color changes.
  useEffect(() => {
    colorsRef.current = { brand: brandColor, secondary: secondaryColor };
  }, [brandColor, secondaryColor]);

  // Handle OUTBID burst.
  useEffect(() => {
    if (burstKey === burstKeyRef.current) return;
    burstKeyRef.current = burstKey;
    if (burstKey === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const fromRgb = hexToRgb(burstFromColor ?? brandColor);
    const toRgb = hexToRgb(burstToColor ?? secondaryColor);

    // Spawn a burst of particles from center, mixing old and new colors.
    for (let i = 0; i < 80; i++) {
      const angle = (i / 80) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 3 + Math.random() * 6;
      const useTo = Math.random() > 0.3;
      const rgb = useTo ? toRgb : fromRgb;
      const hue = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
      particlesRef.current.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 8 + Math.random() * 20,
        baseRadius: 8 + Math.random() * 20,
        hue,
        alpha: 0.8,
        life: 1,
        burst: true,
      });
    }
  }, [burstKey, burstFromColor, burstToColor, brandColor, secondaryColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Seed ambient particles.
    const seedCount = 18;
    if (particlesRef.current.length === 0) {
      for (let i = 0; i < seedCount; i++) {
        particlesRef.current.push(createAmbient(canvas.width, canvas.height));
      }
    }

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      const signal = signalRef.current;

      // Trail effect — don't fully clear, leave a faint ghost.
      ctx.fillStyle = "rgba(11, 11, 26, 0.08)";
      ctx.fillRect(0, 0, w, h);

      const { brand, secondary } = colorsRef.current;
      const [br, bg, bb] = hexToRgb(brand);
      const [sr, sg, sb] = hexToRgb(secondary);

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // Audio reactivity — swell on amplitude, pulse on beat.
        const audioSwell = 1 + signal.smoothAmplitude * 0.6 + signal.beat * 0.4;
        p.radius = p.baseRadius * audioSwell;

        if (p.burst) {
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.96;
          p.vy *= 0.96;
          p.life -= 0.012;
          p.alpha = p.life * 0.7;
          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }
        } else {
          // Ambient drift — slow, organic, audio-modulated.
          p.x += p.vx * (0.5 + signal.smoothAmplitude * 0.5);
          p.y += p.vy * (0.5 + signal.smoothAmplitude * 0.5);
          // Wrap around edges.
          if (p.x < -p.radius) p.x = w + p.radius;
          if (p.x > w + p.radius) p.x = -p.radius;
          if (p.y < -p.radius) p.y = h + p.radius;
          if (p.y > h + p.radius) p.y = -p.radius;
          p.alpha = 0.15 + signal.smoothAmplitude * 0.25;
        }

        // Draw as a radial gradient blob — metaball-ish.
        const colorMix = p.burst
          ? [(p.hue >> 16) & 255, (p.hue >> 8) & 255, p.hue & 255]
          : i % 2 === 0
            ? [br, bg, bb]
            : [sr, sg, sb];

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        grad.addColorStop(
          0,
          `rgba(${colorMix[0]}, ${colorMix[1]}, ${colorMix[2]}, ${p.alpha})`,
        );
        grad.addColorStop(
          0.5,
          `rgba(${colorMix[0]}, ${colorMix[1]}, ${colorMix[2]}, ${p.alpha * 0.3})`,
        );
        grad.addColorStop(
          1,
          `rgba(${colorMix[0]}, ${colorMix[1]}, ${colorMix[2]}, 0)`,
        );
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Maintain ambient population.
      while (particlesRef.current.filter((p) => !p.burst).length < seedCount) {
        particlesRef.current.push(createAmbient(w, h));
      }

      animRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [signalRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

function createAmbient(w: number, h: number): Particle {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    radius: 40 + Math.random() * 80,
    baseRadius: 40 + Math.random() * 80,
    hue: 0,
    alpha: 0.15,
    life: 1,
    burst: false,
  };
}
