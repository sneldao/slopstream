"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BrandSummary } from "@slopstream/shared";
import type { ClearBurst } from "@/lib/streamReducer";

/**
 * The clearing animation — flowing particle streams with trails.
 *
 * When a bid clears: the full amount appears as a glowing number, then
 * particles spawn from center and flow in two streams — 80% toward
 * LISTENER REWARD POOL (brand color) and 20% toward SLOPSTREAM (platform
 * accent). Particles leave trails, curve organically, and the pool counters
 * tick up as they arrive.
 */
export function ClearBurstFlow({
  burst,
  brand,
}: {
  burst: ClearBurst | undefined;
  brand: BrandSummary | undefined;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!burst) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, [burst?.burstId, burst]);

  if (!burst) return null;
  const brandColor = brand?.primaryColor ?? "#ffd76a";
  const platformColor = "#ffd76a";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={burst.burstId}
          style={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ParticleCanvas
            burst={burst}
            brandColor={brandColor}
            platformColor={platformColor}
          />
          <motion.div
            style={styles.gross}
            initial={{ scale: 0.3, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 16 }}
          >
            ${burst.grossAmountUsd.toFixed(2)}
          </motion.div>
          <motion.div
            style={styles.cleared}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            CLEARED
          </motion.div>
          <div style={styles.pools}>
            <PoolLabel
              label="LISTENER REWARD POOL"
              amount={burst.listenerPoolUsd}
              color={brandColor}
              delay={0.5}
              align="left"
            />
            <PoolLabel
              label="SLOPSTREAM"
              amount={burst.platformRevenueUsd}
              color={platformColor}
              delay={0.7}
              align="right"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ParticleCanvas({
  burst,
  brandColor,
  platformColor,
}: {
  burst: ClearBurst;
  brandColor: string;
  platformColor: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    // Pool positions — left and right bottom.
    const listenerPool = { x: w * 0.2, y: h * 0.8 };
    const platformPool = { x: w * 0.8, y: h * 0.8 };

    interface P {
      x: number;
      y: number;
      vx: number;
      vy: number;
      tx: number;
      ty: number;
      color: string;
      life: number;
      trail: [number, number][];
      size: number;
    }

    const particles: P[] = [];
    const totalParticles = 60;
    let spawned = 0;
    let frame = 0;
    let raf = 0;

    const spawn = () => {
      // 80% listener, 20% platform.
      const isListener = Math.random() < 0.8;
      const target = isListener ? listenerPool : platformPool;
      const color = isListener ? brandColor : platformColor;
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 3;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        tx: target.x,
        ty: target.y,
        color,
        life: 1,
        trail: [],
        size: 3 + Math.random() * 4,
      });
    };

    const render = () => {
      frame++;
      ctx.fillStyle = "rgba(11, 11, 26, 0.12)";
      ctx.fillRect(0, 0, w, h);

      // Spawn gradually.
      if (spawned < totalParticles && frame % 3 === 0) {
        spawn();
        spawned++;
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // Steer toward target.
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 20) {
          p.life -= 0.05;
        } else {
          const force = 0.15;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
          p.vx *= 0.96;
          p.vy *= 0.96;
        }

        p.x += p.vx;
        p.y += p.vy;

        // Trail.
        p.trail.push([p.x, p.y]);
        if (p.trail.length > 12) p.trail.shift();

        // Draw trail.
        for (let j = 0; j < p.trail.length; j++) {
          const [tx, ty] = p.trail[j];
          const trailAlpha = (j / p.trail.length) * p.life * 0.5;
          ctx.beginPath();
          ctx.arc(tx, ty, p.size * (j / p.trail.length), 0, Math.PI * 2);
          ctx.fillStyle = hexA(p.color, trailAlpha);
          ctx.fill();
        }

        // Draw head.
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          p.size * 2,
        );
        grad.addColorStop(0, hexA(p.color, p.life));
        grad.addColorStop(1, hexA(p.color, 0));
        ctx.fillStyle = grad;
        ctx.fill();

        if (p.life <= 0) particles.splice(i, 1);
      }

      if (particles.length > 0 || spawned < totalParticles) {
        raf = requestAnimationFrame(render);
      }
    };
    render();

    return () => cancelAnimationFrame(raf);
  }, [burst.burstId, brandColor, platformColor]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={500}
      style={styles.particleCanvas}
    />
  );
}

function PoolLabel({
  label,
  amount,
  color,
  delay,
  align,
}: {
  label: string;
  amount: number;
  color: string;
  delay: number;
  align: "left" | "right";
}) {
  return (
    <motion.div
      style={{
        ...styles.poolLabel,
        textAlign: align,
        alignItems: align === "left" ? "flex-start" : "flex-end",
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 300, damping: 20 }}
    >
      <motion.div
        style={{ ...styles.poolAmount, color }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{
          delay: delay + 0.3,
          type: "spring",
          stiffness: 400,
          damping: 12,
        }}
      >
        ${amount.toFixed(2)}
      </motion.div>
      <div style={styles.poolText}>{label}</div>
    </motion.div>
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
  overlay: {
    position: "absolute",
    inset: 0,
    zIndex: 40,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  particleCanvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  },
  gross: {
    position: "relative",
    fontSize: "clamp(48px, 9vw, 120px)",
    fontWeight: 900,
    color: "#fff",
    textShadow: "0 0 40px rgba(255,224,102,0.8), 0 4px 20px rgba(0,0,0,0.5)",
    fontVariantNumeric: "tabular-nums",
  },
  cleared: {
    position: "relative",
    fontSize: "clamp(16px, 2.5vw, 28px)",
    fontWeight: 800,
    letterSpacing: 6,
    color: "rgba(255,255,255,0.8)",
    marginTop: 4,
  },
  pools: {
    position: "relative",
    display: "flex",
    justifyContent: "space-between",
    width: "min(600px, 80%)",
    marginTop: 60,
  },
  poolLabel: { display: "flex", flexDirection: "column", gap: 4 },
  poolAmount: {
    fontSize: "clamp(28px, 4vw, 48px)",
    fontWeight: 900,
    fontVariantNumeric: "tabular-nums",
  },
  poolText: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: 700,
    color: "var(--platform-text-dim)",
  },
};
