"use client";

import { useMemo } from "react";
import { Physics } from "@react-three/rapier";
import { BrandBlob } from "./BrandBlob";
import type { AudioSignal } from "@/lib/useAudioSignal";
import type { LeaderboardEntry, BrandSummary } from "@slopstream/shared";

interface BrandBlobFieldProps {
  leaderboard: LeaderboardEntry[];
  brandById: Record<string, BrandSummary>;
  /** OUTBID flash — when flashId changes, the displaced blob gets a shove. */
  outbidFlashId: number;
  outbidDisplacedBrandId?: string;
  outbidNewBrandId?: string;
  signalRef: React.RefObject<AudioSignal>;
}

/**
 * Maps the leaderboard to 3D brand blob positions. Rank 0 (leader) is at
 * center, largest, glowing. Others are arranged behind with depth —
 * receding into the fluid.
 *
 * Layout: leader at (0, 0, 0). Others in a loose arc behind, offset by rank.
 * The arc spreads horizontally and recedes in Z so they don't overlap.
 *
 * On OUTBID: the displaced blob gets a velocity kick from the new leader's
 * direction — a shove out of center. The new leader springs to center.
 * Each blob decides for itself whether it's the displaced one (by comparing
 * its own brandId to `outbidDisplacedBrandId`), so the impulse fires exactly
 * once on the right blob regardless of render timing.
 */
export function BrandBlobField({
  leaderboard,
  brandById,
  outbidFlashId,
  outbidDisplacedBrandId,
  outbidNewBrandId,
  signalRef,
}: BrandBlobFieldProps) {
  // Compute target positions for each leaderboard entry.
  const positions = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    leaderboard.forEach((entry, i) => {
      if (i === 0) {
        // Leader at center.
        map.set(entry.brandId, [0, 0, 0]);
      } else {
        // Others in a spread behind the leader, receding in Z.
        const angle = (i - 1) * 0.8 - 0.4; // spread horizontally
        const depth = -0.8 - i * 0.4;
        const x = Math.sin(angle) * 1.2;
        const y = Math.cos(angle) * 0.6 - 0.3;
        map.set(entry.brandId, [x, y, depth]);
      }
    });
    return map;
  }, [leaderboard]);

  return (
    <Physics gravity={[0, 0, 0]}>
      {leaderboard.map((entry, i) => {
        const brand = brandById[entry.brandId];
        const pos = positions.get(entry.brandId) ?? [0, 0, -2];
        const isLeader = i === 0;

        // Impulse direction: from new leader (center) toward displaced blob.
        const impulseDir: [number, number, number] = isLeader
          ? [0, 0, 0]
          : [pos[0] > 0 ? 1 : -1, 0.3, 0];

        return (
          <BrandBlob
            key={entry.brandId}
            brandId={entry.brandId}
            color={brand?.primaryColor ?? "#666"}
            secondaryColor={brand?.secondaryColor ?? "#333"}
            rank={i}
            isLeader={isLeader}
            targetPosition={pos}
            outbidFlashId={outbidFlashId}
            outbidDisplacedBrandId={outbidDisplacedBrandId}
            impulseDirection={impulseDir}
            signalRef={signalRef}
          />
        );
      })}
    </Physics>
  );
}
