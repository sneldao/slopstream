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
import { FREE_BRAND_ID, FREE_BRAND_SUMMARY } from "@slopstream/shared";
import { isoNow, newId } from "./ids.js";
import type {
  ScrapedCompanySource,
  ScrapedCompanySubmission,
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
  /** Set when a grace-period close is scheduled but not yet evaluated. */
  windowClosingAtMs?: number;
  windowClosed: boolean;
  /** Cleared bid amount, frozen when the attention window closes successfully.
   *  The durable price-of-attention history — served on the segment and the
   *  price-history API. */
  clearedAmountCents?: number;
  /** Time the clearing evaluation settled successfully, distinct from playback
   *  start and used as the canonical price-history timestamp. */
  clearedAtMs?: number;
  /** Generation brief for free (scraped-company) segments; paid segments
   *  resolve the brief from their brand at read time. */
  brief?: string;
  /** The scraped company this free segment was generated from. */
  scrapedCompanyId?: string;
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
  /** Opaque bearer credential for this anonymous session. */
  token: string;
  /** Browser-generated commitment bound once when the session is created. */
  commitment: string;
  joinedAt: string;
  /** Last authenticated activity; used for the live audience denominator. */
  lastSeenAtMs: number;
  balanceCents: number;
  todayVerifiedCents: number;
  /** Lifetime proof outcomes; a lopsided ratio locks the session (anti-guessing). */
  validProofs: number;
  invalidProofs: number;
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
  /** Snapshot at verify time; pending until the segment window closes. */
  estimatedRewardCents?: number;
}

export interface ListenerPayoutRow {
  id: string;
  listenerSessionId: string;
  amountCents: number;
  status: "completed";
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

export interface ScrapedCompanyRow {
  id: string;
  name: string;
  source: ScrapedCompanySource;
  sourceUrl: string;
  tagline?: string;
  description?: string;
  scrapedAt: string;
  claimed: boolean;
  /** Set when the company has been turned into a free stream segment. */
  usedAtMs?: number;
  /** Set when the company has opted out of being featured. */
  optedOut?: boolean;
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
  readonly listenerPayouts = new Map<string, ListenerPayoutRow>();
  readonly auctions = new Map<number, AuctionRow>(); // by slot
  readonly scrapedCompanies = new Map<string, ScrapedCompanyRow>();
  /** Dedupe index: sourceUrl -> scrapedCompanyId. */
  readonly scrapedByUrl = new Map<string, string>();
  /** Stripe Checkout session IDs already credited (webhook retry guard). */
  readonly processedStripeSessions = new Set<string>();

  constructor() {
    // Register the free-filler pseudo-brand so clients can resolve a palette
    // for free segments' public events (see FREE_BRAND_ID in shared). It has
    // no token, no balance, and never bids — it is presentation-only.
    this.brands.set(FREE_BRAND_ID, {
      id: FREE_BRAND_ID,
      name: FREE_BRAND_SUMMARY.name,
      primaryColor: FREE_BRAND_SUMMARY.primaryColor,
      secondaryColor: FREE_BRAND_SUMMARY.secondaryColor,
      brief: "",
      token: "",
      createdAt: isoNow(),
    });
  }

  // ------------------------------------------------------- scraped companies

  /**
   * Insert scraped-company submissions, deduping by sourceUrl (and by name
   * for the same source). Returns how many were added vs skipped.
   */
  insertScrapedCompanies(submissions: ScrapedCompanySubmission[]): {
    added: number;
    duplicates: number;
  } {
    let added = 0;
    let duplicates = 0;
    for (const sub of submissions) {
      if (!sub?.name || !sub?.source || !sub?.sourceUrl) {
        duplicates += 1;
        continue;
      }
      const urlKey = sub.sourceUrl.trim().toLowerCase();
      const nameKey = `${sub.source}:${sub.name.trim().toLowerCase()}`;
      if (this.scrapedByUrl.has(urlKey)) {
        duplicates += 1;
        continue;
      }
      const existingByName = [...this.scrapedCompanies.values()].find(
        (c) => `${c.source}:${c.name.toLowerCase()}` === nameKey,
      );
      if (existingByName) {
        duplicates += 1;
        continue;
      }
      const row: ScrapedCompanyRow = {
        id: newId("scrp"),
        name: sub.name.trim(),
        source: sub.source,
        sourceUrl: sub.sourceUrl.trim(),
        ...(sub.tagline?.trim() ? { tagline: sub.tagline.trim() } : {}),
        ...(sub.description?.trim()
          ? { description: sub.description.trim() }
          : {}),
        scrapedAt: isoNow(),
        claimed: false,
      };
      this.scrapedCompanies.set(row.id, row);
      this.scrapedByUrl.set(urlKey, row.id);
      added += 1;
    }
    return { added, duplicates };
  }

  /** Oldest scraped company that has not been turned into a segment yet and has not opted out. */
  nextUnusedScrapedCompany(): ScrapedCompanyRow | undefined {
    let best: ScrapedCompanyRow | undefined;
    for (const row of this.scrapedCompanies.values()) {
      if (row.usedAtMs === undefined && !row.optedOut) {
        if (!best || row.scrapedAt < best.scrapedAt) best = row;
      }
    }
    return best;
  }

  markScrapedCompanyUsed(id: string): void {
    const row = this.scrapedCompanies.get(id);
    if (row && row.usedAtMs === undefined) row.usedAtMs = Date.now();
  }

  /** Opt a company out of being featured. Looked up by sourceUrl. */
  markOptedOut(sourceUrl: string): { found: boolean; optedOut: boolean } {
    const id = this.scrapedByUrl.get(sourceUrl);
    if (!id) return { found: false, optedOut: false };
    const row = this.scrapedCompanies.get(id);
    if (!row) return { found: false, optedOut: false };
    row.optedOut = true;
    return { found: true, optedOut: true };
  }

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

  activeListenerCount(nowMs: number, activeWindowMs: number): number {
    const cutoff = nowMs - activeWindowMs;
    let count = 0;
    for (const listener of this.listeners.values()) {
      if (listener.lastSeenAtMs >= cutoff) count++;
    }
    return count;
  }
}
