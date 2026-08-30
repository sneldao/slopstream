// In-memory implementation of the Postgres ledger schema
// (docs/technical/backend.md — Backend ledger). All amounts are integer cents.
// This store is the single swap point for a real Postgres adapter later; every
// service depends on these shapes, not on Maps.

import type {
  BidStatus,
  ChallengeType,
  ProductionTier,
  RewardPoolStatus,
  SegmentStatus,
} from "@slopstream/shared";

export interface BrandRow {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  /** Campaign brief fed to the generation pipeline when this brand wins. */
  brief: string;
  /** Bearer token for the brand console. */
  token: string;
  createdAt: string;
}

export interface BrandBalanceRow {
  brandId: string;
  /** Unencumbered funds. */
  availableCents: number;
  /** Held against standing bids until they clear or are released. */
  reservedCents: number;
  /** Cleared spend (never refunded). */
  spentCents: number;
}

export interface BidRow {
  id: string;
  brandId: string;
  slot: number;
  amountCents: number;
  tier: ProductionTier;
  status: BidStatus;
  segmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SegmentRow {
  id: string;
  slot: number;
  /** null = free ad generated from scraped startup data. */
  brandId: string | null;
  /** Winning bid for paid segments. */
  bidId: string | null;
  status: SegmentStatus;
  durationSec: number;
  mediaUrl?: string;
  summary: string;
  /** Platform-set threshold fraction frozen onto the segment at creation. */
  thresholdFraction: number;
  /** Absolute event count frozen at window open. */
  requiredEvents?: number;
  /** Playback start — opens the attention window. */
  windowOpenedAtMs?: number;
  windowClosed: boolean;
}

export interface ChallengeRow {
  id: string;
  segmentId: string;
  type: ChallengeType;
  question: string;
  options?: string[];
  /** Backend-only. Never leaves the process. */
  answer: string;
  validFrom: number;
  validUntil: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Set when handed to the orchestrator for broadcast. */
  firedAtMs?: number;
}

export interface ListenerSessionRow {
  id: string;
  token: string;
  joinedAt: string;
  balanceCents: number;
  todayVerifiedCents: number;
}

export interface AttentionEventRow {
  id: string;
  listenerSessionId: string;
  segmentId: string;
  challengeId: string;
  result: "valid" | "invalid";
  difficulty: number;
  /** Seconds between challenge availability and the answer. */
  durationSec: number;
  uniquenessScore: number;
  proofRef: string;
  createdAt: string;
}

export interface RewardPoolRow {
  id: string;
  bidId: string;
  grossCents: number;
  listenerPct: number;
  platformPct: number;
  eligibleCents: number;
  distributedCents: number;
  status: RewardPoolStatus;
  createdAt: string;
}

export interface ListenerRewardRow {
  id: string;
  listenerSessionId: string;
  rewardPoolId: string;
  amountCents: number;
  status: "credited" | "withdrawn";
  createdAt: string;
}

export interface AuctionRow {
  slot: number;
  status: "open" | "closed";
  openingCents: number;
  /** Minimum increment between bids. */
  incrementCents: number;
  closesAtMs: number;
  winnerBidId?: string;
}

export class Ledger {
  readonly brands = new Map<string, BrandRow>();
  readonly brandTokens = new Map<string, string>(); // token -> brandId
  readonly balances = new Map<string, BrandBalanceRow>(); // by brandId
  readonly bids = new Map<string, BidRow>();
  readonly segments = new Map<string, SegmentRow>();
  readonly challenges = new Map<string, ChallengeRow>();
  readonly listeners = new Map<string, ListenerSessionRow>();
  readonly listenerTokens = new Map<string, string>(); // token -> sessionId
  readonly attentionEvents = new Map<string, AttentionEventRow>();
  readonly rewardPools = new Map<string, RewardPoolRow>();
  readonly listenerRewards = new Map<string, ListenerRewardRow>();
  readonly auctions = new Map<number, AuctionRow>(); // by slot

  brandByToken(token: string): BrandRow | undefined {
    const id = this.brandTokens.get(token);
    return id ? this.brands.get(id) : undefined;
  }

  listenerByToken(token: string): ListenerSessionRow | undefined {
    const id = this.listenerTokens.get(token);
    return id ? this.listeners.get(id) : undefined;
  }

  /** The brand's currently standing (pending) bid for a slot, if any. */
  standingBidFor(brandId: string, slot: number): BidRow | undefined {
    for (const bid of this.bids.values()) {
      if (
        bid.brandId === brandId &&
        bid.slot === slot &&
        bid.status === "pending"
      )
        return bid;
    }
    return undefined;
  }

  /** All pending bids on a slot, highest first. */
  pendingBidsForSlot(slot: number): BidRow[] {
    return [...this.bids.values()]
      .filter((b) => b.slot === slot && b.status === "pending")
      .sort((a, b) => b.amountCents - a.amountCents);
  }

  validEventsForSegment(segmentId: string): AttentionEventRow[] {
    return [...this.attentionEvents.values()].filter(
      (e) => e.segmentId === segmentId && e.result === "valid",
    );
  }

  challengesForSegment(segmentId: string): ChallengeRow[] {
    return [...this.challenges.values()].filter(
      (c) => c.segmentId === segmentId,
    );
  }
}
