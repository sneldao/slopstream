import type { StreamState } from "./streamReducer";

export const LOOP_STEPS = [
  { id: "bid", label: "Bid" },
  { id: "play", label: "Play" },
  { id: "prove", label: "Prove" },
  { id: "clear", label: "Clear" },
] as const;

export type LoopPhase = (typeof LOOP_STEPS)[number]["id"];

/**
 * Derive where the attention market is in its public loop from stream state.
 * Used by the shared LoopStatus stepper on every surface.
 */
export function deriveLoopPhase(state: StreamState): LoopPhase {
  if (state.activeChallenge) return "prove";

  if (state.nowPlaying && state.attention) {
    if (
      state.attention.threshold > 0 &&
      state.attention.verifiedCount >= state.attention.threshold
    ) {
      return "clear";
    }
    return "prove";
  }

  if (state.nowPlaying || state.generation) return "play";
  return "bid";
}
