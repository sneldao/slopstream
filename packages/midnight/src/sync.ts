import type { FacadeState } from "@midnight-ntwrk/wallet-sdk-facade";

/**
 * Sync predicates mirrored from the official Midnight bboard example
 * (example-bboard/bboard-cli/src/wallet-utils.ts). A wallet state emission
 * is only trustworthy once shielded, unshielded, AND dust all report
 * strictly-complete progress — otherwise a zero balance may just mean
 * "not synced yet", and tight polling loops OOM during initial sync.
 */
const isProgressStrictlyComplete = (progress: unknown): boolean => {
  if (!progress || typeof progress !== "object") return false;
  const candidate = progress as { isStrictlyComplete?: unknown };
  if (typeof candidate.isStrictlyComplete !== "function") return false;
  return (candidate.isStrictlyComplete as () => boolean)();
};

export const isFacadeStateSynced = (state: FacadeState): boolean =>
  isProgressStrictlyComplete(state.shielded.state.progress) &&
  isProgressStrictlyComplete(state.dust.state.progress) &&
  isProgressStrictlyComplete(state.unshielded.progress);
