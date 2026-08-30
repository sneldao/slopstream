"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { AttentionState } from "@/lib/streamReducer";
import type { AudioSignal } from "@/lib/useAudioSignal";

/**
 * The attention threshold as sloshing liquid — not a bar, not a tube.
 * A canvas-rendered liquid surface with wave physics that sloshes with
 * the audio signal and reacts to verified counts arriving. When the
 * threshold is met, the liquid glows and bubbles rise.
 */
export function LiquidThreshold({
  attention,
  signalRef,
}: {
  attention: AttentionState | undefined;
  signalRef: React.RefObject<AudioSignal>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetFillRef = useRef(0);
  const currentFillRef = useRef(0);
  const phaseRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (attention) {
      const fill =
        attention.threshold > 0
          ? Math.min(attention.verifiedCount / attention.threshold, 1)
          : 0;
      targetFillRef.current = fill;
    }
  }, [attention]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      phaseRef.current += 0.03;
      const phase = phaseRef.current;

      // Smoothly approach target fill.
      currentFillRef.current +=
        (targetFillRef.current - currentFillRef.current) * 0.06;
      const fill = currentFillRef.current;
      const cleared = fill >= 0.999;

      const signal = signalRef.current;
      const audioPulse = signal?.smoothAmplitude ?? 0;
      const beatPulse = signal?.beat ?? 0;

      ctx.clearRect(0, 0, w, h);

      const liquidHeight = h * fill;
      const surfaceY = h - liquidHeight;

      // Draw the liquid body with a wavy surface.
      const waveAmp = 3 + audioPulse * 6 + beatPulse * 8;
      const wavePoints: [number, number][] = [];
      const segments = 40;
      for (let i = 0; i <= segments; i++) {
        const x = (i / segments) * w;
        const wave =
          Math.sin(x * 0.03 + phase * 2) * waveAmp +
          Math.sin(x * 0.07 + phase * 3.5) * waveAmp * 0.5;
        wavePoints.push([x, surfaceY + wave]);
      }

      // Liquid fill gradient.
      const grad = ctx.createLinearGradient(0, surfaceY, 0, h);
      if (cleared) {
        grad.addColorStop(0, "rgba(255, 224, 102, 0.95)");
        grad.addColorStop(1, "rgba(255, 157, 74, 0.85)");
      } else {
        grad.addColorStop(0, "rgba(255, 157, 74, 0.9)");
        grad.addColorStop(1, "rgba(200, 90, 31, 0.8)");
      }

      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(wavePoints[0][0], wavePoints[0][1]);
      for (let i = 1; i < wavePoints.length; i++) {
        const [x, y] = wavePoints[i];
        const [px, py] = wavePoints[i - 1];
        const cpx = (px + x) / 2;
        ctx.quadraticCurveTo(px, py, cpx, (py + y) / 2);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Glow on the surface when cleared.
      if (cleared) {
        ctx.strokeStyle = "rgba(255, 224, 102, 0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wavePoints[0][0], wavePoints[0][1]);
        for (let i = 1; i < wavePoints.length; i++) {
          const [x, y] = wavePoints[i];
          const [px, py] = wavePoints[i - 1];
          const cpx = (px + x) / 2;
          ctx.quadraticCurveTo(px, py, cpx, (py + y) / 2);
        }
        ctx.stroke();
      }

      // Bubbles rising when cleared.
      if (cleared) {
        for (let i = 0; i < 5; i++) {
          const bx = (phase * 20 + i * 60) % w;
          const by = h - ((phase * 40 + i * 50) % liquidHeight);
          const br = 2 + Math.sin(phase + i) * 1;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          ctx.fill();
        }
      }

      // Threshold marker line.
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.stroke();
      ctx.setLineDash([]);

      rafRef.current = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(rafRef.current);
  }, [signalRef]);

  if (!attention) return null;
  const cleared = attention.verifiedCount >= attention.threshold;

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span style={styles.label}>
          {cleared ? "✓ THRESHOLD MET" : "ATTENTION WINDOW"}
        </span>
        <span style={styles.count}>
          <span className="slop-figures">{attention.verifiedCount}</span>
          <span style={styles.dim}> / </span>
          <span className="slop-figures" style={styles.dim}>
            {attention.threshold}
          </span>
        </span>
      </div>
      <canvas ref={canvasRef} width={300} height={120} style={styles.canvas} />
      <div style={styles.footer}>
        <span style={styles.dim}>
          <span className="slop-figures">{attention.total}</span> listeners in
          window
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 6, width: "100%" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  label: {
    fontSize: 13,
    letterSpacing: 2,
    fontWeight: 800,
    color: "var(--platform-text-dim)",
  },
  count: { fontSize: 24, fontWeight: 900, color: "#fff" },
  dim: { color: "var(--platform-text-dim)", fontWeight: 600 },
  canvas: { width: "100%", height: 120, borderRadius: 12 },
  footer: { display: "flex", justifyContent: "flex-end", fontSize: 12 },
};
