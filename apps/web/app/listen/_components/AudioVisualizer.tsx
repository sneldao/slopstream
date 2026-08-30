"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { AudioSignal } from "@/lib/useAudioSignal";

/**
 * Audio-reactive visualizer — a pulsing blob that breathes with the shared
 * audio signal. Tinted to the current brand's color, matching the big screen.
 * The blob deforms organically with the amplitude and pulses on beats.
 */
export function AudioVisualizer({
  brandColor,
  active,
  signalRef,
}: {
  brandColor: string;
  active: boolean;
  signalRef: React.RefObject<AudioSignal>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let phase = 0;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const signal = signalRef.current;
      const amp = active ? signal.smoothAmplitude : 0.05;
      const beat = active ? signal.beat : 0;
      phase += 0.03;

      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.22;
      const segments = 64;

      // Draw a blobby circle with per-segment radius variation driven by audio.
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const noise =
          Math.sin(angle * 3 + phase * 1.5) * amp * 25 +
          Math.sin(angle * 5 + phase * 0.8) * amp * 15 +
          Math.sin(angle * 7 + phase * 2.1) * beat * 12;
        const r = baseRadius * (1 + amp * 0.5) + noise;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Fill with a radial gradient in the brand color.
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 2);
      grad.addColorStop(0, hexA(brandColor, 0.8 + amp * 0.2));
      grad.addColorStop(0.5, hexA(brandColor, 0.3 + amp * 0.15));
      grad.addColorStop(1, hexA(brandColor, 0));
      ctx.fillStyle = grad;
      ctx.fill();

      // Glow stroke — brighter on beat.
      ctx.strokeStyle = hexA(brandColor, 0.4 + beat * 0.3);
      ctx.lineWidth = 2 + beat * 2;
      ctx.stroke();

      raf = requestAnimationFrame(render);
    };
    render();

    return () => cancelAnimationFrame(raf);
  }, [brandColor, active, signalRef]);

  return (
    <div style={styles.wrap}>
      <motion.canvas
        ref={canvasRef}
        width={300}
        height={200}
        style={styles.canvas}
        animate={{ opacity: active ? 1 : 0.5 }}
        transition={{ duration: 0.6 }}
      />
    </div>
  );
}

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16) || 255;
  const g = parseInt(full.slice(2, 4), 16) || 255;
  const b = parseInt(full.slice(4, 6), 16) || 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px 0",
  },
  canvas: {
    width: "100%",
    maxWidth: 320,
    height: "auto",
    aspectRatio: "3 / 2",
  },
};
