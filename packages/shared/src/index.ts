// Shared contract between all Slopstream lanes.
// Changes land here first; every lane updates together.
// See docs/hackathon/team-split.md — "The seams: contract-first on day 1".

// ---------------------------------------------------------------------------
// Production tiers
// ---------------------------------------------------------------------------

export type ProductionTier = "audio" | "audio_image" | "video" | "premium";

export const TIER_BID_THRESHOLDS_USD = {
  audio: { min: 1, max: 5 },
  audio_image: { min: 5, max: 20 },
  video: { min: 20, max: 50 },
  premium: { min: 50, max: null },
} as const;

// ---------------------------------------------------------------------------
// Attention challenges
// ---------------------------------------------------------------------------

export type ChallengeType =
  | "recall"
  | "audio"
  | "visual"
  | "completion"
  | "true_false"
  | "sequence"
  | "voice"
  | "image";

export interface Challenge {
  id: string;
  type: ChallengeType;
  question: string;
  /** Present for multiple-choice style challenges. */
  options?: string[];
  answer: string;
  segmentId: string;
  /** Seconds from segment start when the challenge becomes answerable. */
  validFrom: number;
  /** Seconds from segment start when the challenge expires. */
  validUntil: number;
  /** 1 (easiest) to 5 (hardest). Feeds reward weighting. */
  difficulty: 1 | 2 | 3 | 4 | 5;
}

// ---------------------------------------------------------------------------
// Attention proofs (Lane 1 boundary)
// ---------------------------------------------------------------------------

export interface AttentionProofSubmission {
  /** Privacy-preserving listener commitment; identity never leaves the client. */
  listenerCommitment: string;
  segmentId: string;
  challengeId: string;
  /** Opaque proof payload verified by ProofOfAttention. */
  resultProof: string;
}

export interface AttentionProofReceipt {
  proofId: string;
  segmentId: string;
  challengeId: string;
  brandId: string;
  challengeType: ChallengeType;
  verified: boolean;
  estimatedRewardUsd?: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Bids and clearing (Lane 2 boundary)
// ---------------------------------------------------------------------------

export type BidStatus = "pending" | "winning" | "won" | "cleared" | "lost";

export interface Bid {
  id: string;
  brandId: string;
  amountUsd: number;
  segmentSlot: number;
  tier: ProductionTier;
  status: BidStatus;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Segments and the stream (Lane 3 boundary)
// ---------------------------------------------------------------------------

export type SegmentStatus =
  "queued" | "generating" | "ready" | "playing" | "done";

export interface Segment {
  id: string;
  slot: number;
  /** null = free ad generated from scraped startup data. */
  brandId: string | null;
  mediaUrl?: string;
  durationSeconds: number;
  /** Infinite Slop continuity input for the next generation. */
  summary: string;
  status: SegmentStatus;
}

// ---------------------------------------------------------------------------
// Reward pools
// ---------------------------------------------------------------------------

export type RewardPoolStatus = "pending" | "open" | "distributed" | "closed";

export interface RewardPool {
  id: string;
  bidId: string;
  grossAmountUsd: number;
  /** e.g. 0.8 */
  listenerPercentage: number;
  /** e.g. 0.2 */
  platformPercentage: number;
  /** gross * listenerPercentage */
  eligibleAmountUsd: number;
  distributedAmountUsd: number;
  status: RewardPoolStatus;
}

// ---------------------------------------------------------------------------
// WebSocket events (orchestrator/API → every screen)
// ---------------------------------------------------------------------------

export type GenerationStage = "script" | "voice" | "image" | "video";

export type WsEvent =
  | { type: "segment_started"; segment: Segment }
  | { type: "segment_generating"; slot: number; brandId: string }
  | {
      type: "generation_progress";
      slot: number;
      stage: GenerationStage;
      done: boolean;
    }
  | { type: "bid_placed"; bid: Bid }
  | { type: "outbid"; previousBidId: string; newBid: Bid }
  | { type: "challenge_issued"; challenge: Challenge }
  | {
      type: "attention_verified";
      segmentId: string;
      proofId: string;
      rewardUsd: number;
    }
  | { type: "bid_cleared"; bidId: string; clearedAmountUsd: number }
  | { type: "reward_pool_created"; pool: RewardPool }
  | {
      type: "stats";
      listeners: number;
      attentionProofs: number;
      listenerRewardsUsd: number;
    };

// ---------------------------------------------------------------------------
// Listener sessions
// ---------------------------------------------------------------------------

export interface ListenerSession {
  id: string;
  joinedAt: string;
  availableBalanceUsd: number;
  todayVerifiedUsd: number;
}
