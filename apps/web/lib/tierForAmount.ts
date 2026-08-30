import {
  TIER_BID_THRESHOLDS_USD,
  type ProductionTier,
} from "@slopstream/shared";

const TIER_ORDER: ProductionTier[] = [
  "audio",
  "audio_image",
  "video",
  "premium",
];

/** Map a bid amount to the production tier it unlocks. */
export function tierForAmount(amountUsd: number): ProductionTier {
  let match: ProductionTier = "audio";
  for (const tier of TIER_ORDER) {
    const { min } = TIER_BID_THRESHOLDS_USD[tier];
    if (amountUsd >= min) match = tier;
  }
  return match;
}

export function tierMin(tier: ProductionTier): number {
  return TIER_BID_THRESHOLDS_USD[tier].min;
}
