import type { LeaderboardEntry } from "@slopstream/shared";

export interface BidMinimum {
  minimumUsd: number;
  iAmLeading: boolean;
  isBidTooLow: boolean;
  isMarketPriceAvailable: boolean;
}

/**
 * Interpret the API-projected next-slot minimum for the brand console.
 * Auction pricing remains server-owned; the leader only determines UI state.
 */
export function bidMinimum(
  leader: LeaderboardEntry | undefined,
  bidderBrandId: string,
  bidAmountUsd: number,
  nextSlotPriceUsd: number,
): BidMinimum {
  const isMarketPriceAvailable =
    Number.isFinite(nextSlotPriceUsd) && nextSlotPriceUsd > 0;
  const minimumUsd = isMarketPriceAvailable ? nextSlotPriceUsd : 0;

  return {
    minimumUsd,
    iAmLeading: leader?.brandId === bidderBrandId,
    isBidTooLow:
      !Number.isFinite(bidAmountUsd) ||
      !isMarketPriceAvailable ||
      bidAmountUsd < minimumUsd,
    isMarketPriceAvailable,
  };
}
