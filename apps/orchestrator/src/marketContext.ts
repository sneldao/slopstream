import type {
  GenerationMarketContext,
  GenerationResult,
  StreamSnapshot,
} from "@slopstream/shared";

/** Build generation market context from the authoritative stream snapshot. */
export function marketContextFromSnapshot(
  snapshot: StreamSnapshot,
): GenerationMarketContext {
  const leader = snapshot.leaderboard[0];
  const threshold = snapshot.nowPlayingAttentionThreshold;
  const verified = snapshot.attentionProofs;
  const attentionProgress =
    threshold !== undefined && threshold > 0
      ? Math.min(1, verified / threshold)
      : undefined;

  return {
    leaderBrandId: leader?.brandId,
    leaderAmountUsd: leader?.amountUsd,
    openSlot: snapshot.currentAuction?.slot,
    nextSlotPriceUsd: snapshot.nextSlotPriceUsd,
    verifiedCount: verified,
    attentionThreshold: threshold,
    attentionProgress,
  };
}

/** Extract a hero image URL from a generation result for the next segment. */
export function continuityFromResult(
  result: GenerationResult,
): string | undefined {
  const hero = result.visualMetadata?.heroImageUrl;
  if (typeof hero === "string" && hero.length > 0) return hero;
  if (/\.(png|jpe?g|webp)$/i.test(result.assetUrl)) return result.assetUrl;
  return undefined;
}
