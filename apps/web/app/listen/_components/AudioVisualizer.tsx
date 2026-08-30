"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

/**
 * Audio-reactive visualizer — a pulsing blob that breathes with the stream
 * audio (design-language.md "While listening"). For the hackathon this uses
 * a simulated amplitude (no real audio element yet); when a real stream is
 * wired, swap `simulatedAmplitude` for an AnalyserNode's frequency data.
 *
 * The blob is tinted to the current brand's color, matching the big screen.
 */
export function AudioVisualizer({
  brandColor,
  active,
}: {
  brandColor: string;
  active: boolean;
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

      // Simulated amplitude — a mix of sine waves that feels organic.
      // When not active (no segment playing), the blob is calm.
      const amp = active
        ? 0.3 + 0.2 * Math.sin(phase * 0.7) + 0.15 * Math.sin(phase * 2.3)
        : 0.08;
      phase += 0.04;

      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.22;
      const segments = 64;

      // Draw a blobby circle with per-segment radius variation.
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const noise =
          Math.sin(angle * 3 + phase * 1.5) * amp * 18 +
          Math.sin(angle * 5 + phase * 0.8) * amp * 10;
        const r = baseRadius + noise;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Fill with a radial gradient in the brand color.
      const grad = ctx.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        baseRadius * 1.8,
      );
      grad.addColorStop(0, `${brandColor}cc`);
      grad.addColorStop(0.6, `${brandColor}44`);
      grad.addColorStop(1, `${brandColor}00`);
      ctx.fillStyle = grad;
      ctx.fill();

      // Glow stroke.
      ctx.strokeStyle = `${brandColor}66`;
      ctx.lineWidth = 2;
      ctx.stroke();

      raf = requestAnimationFrame(render);
    };
    render();

    return () => cancelAnimationFrame(raf);
  }, [brandColor, active]);

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
