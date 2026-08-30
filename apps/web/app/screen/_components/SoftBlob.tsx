"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { AudioSignal } from "@/lib/useAudioSignal";

/**
 * A soft-body blob — the Floaty soul. Renders as an SVG path that wobbles
 * and deforms organically. Used for leaderboard chips and brand mascots.
 *
 * The blob is a closed path with N control points arranged in a circle.
 * Each point oscillates with spring physics + noise, creating a jelly-like
 * surface that breathes with the audio signal and wobbles on displacement.
 */

interface BlobProps {
  color: string;
  secondaryColor: string;
  /** 0..1 — how much the blob wobbles. Higher = more agitated. */
  agitation?: number;
  signalRef?: React.RefObject<AudioSignal>;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function SoftBlob({
  color,
  secondaryColor,
  agitation = 0.3,
  signalRef,
  width = 200,
  height = 80,
  className,
  style,
}: BlobProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const phaseRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const points = 8;
    const cx = width / 2;
    const cy = height / 2;
    const rx = width / 2 - 4;
    const ry = height / 2 - 4;

    const animate = () => {
      phaseRef.current += 0.02;
      const phase = phaseRef.current;
      const signal = signalRef?.current;
      const audioBoost = signal
        ? signal.smoothAmplitude * 0.3 + signal.beat * 0.2
        : 0;
      const wobble = agitation + audioBoost;

      const pts: [number, number][] = [];
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const noise =
          Math.sin(angle * 3 + phase * 1.5) * wobble * 8 +
          Math.sin(angle * 5 + phase * 0.8) * wobble * 5 +
          Math.cos(angle * 2 + phase * 2.1) * wobble * 4;
        const r = 1 + noise / Math.max(rx, ry);
        pts.push([
          cx + Math.cos(angle) * rx * r,
          cy + Math.sin(angle) * ry * r,
        ]);
      }

      // Build a smooth closed path through the points using Catmull-Rom.
      const d = catmullRomClosed(pts);
      if (pathRef.current) pathRef.current.setAttribute("d", d);

      rafRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height, agitation, signalRef]);

  const id = useRef(
    `blob-grad-${Math.random().toString(36).slice(2, 8)}`,
  ).current;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={style}
      className={className}
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={secondaryColor} stopOpacity="0.8" />
        </linearGradient>
        <filter id={`${id}-blur`}>
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
      </defs>
      <path
        ref={pathRef}
        fill={`url(#${id})`}
        filter={`url(#${id}-blur)`}
        opacity="0.92"
      />
    </svg>
  );
}

/** Catmull-Rom spline through points, closed. Produces a smooth organic curve. */
function catmullRomClosed(pts: [number, number][]): string {
  const n = pts.length;
  if (n < 3) return "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  d += " Z";
  return d;
}

/**
 * A leaderboard chip rendered as a soft blob with the brand name + amount
 * floating inside. Wobbles on layout change, squishes on OUTBID.
 */
export function BlobChip({
  name,
  amount,
  color,
  secondaryColor,
  rank,
  isLeader,
  signalRef,
  agitation,
}: {
  name: string;
  amount: string;
  color: string;
  secondaryColor: string;
  rank: number;
  isLeader: boolean;
  signalRef?: React.RefObject<AudioSignal>;
  agitation?: number;
}) {
  const width = isLeader ? 280 : 240;
  const height = isLeader ? 72 : 60;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.5, y: -30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.5, y: 40 }}
      transition={{ type: "spring", stiffness: 280, damping: 20 }}
      style={{
        position: "relative",
        width,
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SoftBlob
        color={color}
        secondaryColor={secondaryColor}
        agitation={agitation ?? (isLeader ? 0.35 : 0.2)}
        signalRef={signalRef}
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0 }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 20px",
          width: "100%",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{ fontSize: 12, opacity: 0.7, fontWeight: 700, color: "#fff" }}
        >
          #{rank}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: isLeader ? 20 : 17,
            fontWeight: 800,
            color: "#fff",
            textShadow: "0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {name}
        </span>
        <motion.span
          key={amount}
          initial={{ scale: 1.5 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 14 }}
          style={{
            fontSize: isLeader ? 22 : 19,
            fontWeight: 900,
            color: "#fff",
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {amount}
        </motion.span>
      </div>
    </motion.div>
  );
}
