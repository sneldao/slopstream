"use client";

import type { StreamState } from "@/lib/streamReducer";

/**
 * Contextual bridge from Brand → Screen when the bidder is leading or on air.
 */
export function ScreenCrossLink({
  brandId,
  state,
  leading,
}: {
  brandId: string;
  state: StreamState;
  /** True right after a successful bid placement. */
  leading?: boolean;
}) {
  const onAir =
    state.nowPlaying?.brandId === brandId ||
    state.generation?.brandId === brandId;
  const isLeader = state.leaderboard[0]?.brandId === brandId;

  if (!onAir && !isLeader && !leading) return null;

  const label = onAir
    ? "Your ad is on air"
    : isLeader || leading
      ? "You're leading the auction"
      : null;
  if (!label) return null;

  return (
    <a className="slop-crosslink" href="/screen">
      <span>{label}</span>
      <strong>Open Screen</strong>
      <span aria-hidden>↗</span>
    </a>
  );
}
