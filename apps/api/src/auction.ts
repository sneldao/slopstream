// Auction engine (Lane 2 owns auction resolution; the orchestrator only
// consumes results — docs/technical/architecture.md). Open ascending auction,
// first-price clearing for the hackathon (docs/product/economics.md — auction
// format). Funds are reserved from brand balance on placement and only settle
// at clearing; a released reservation returns to available.

import type {
  AuctionState,
  LeaderboardEntry,
  ProductionTier,
} from "@slopstream/shared";
import { TIER_BID_THRESHOLDS_USD } from "@slopstream/shared";
import type { EventBus } from "./bus.js";
import { isoNow, newId } from "./ids.js";
import type {
  AuctionRow,
  BidRow,
  BrandRow,
  Ledger,
  SegmentRow,
} from "./ledger.js";
import { assert, centsToUsd, usdToCents } from "./money.js";

export const OPENING_PRICE_CENTS = 500; // $5 floor so the stream never opens at $0
export const MIN_INCREMENT_CENTS = 100; // $1 steps keep the OUTBID beat legible

/** Map a bid amount to its production tier (escalation in surfaces.md). */
export function tierForAmount(amountCents: number): ProductionTier {
  const usd = centsToUsd(amountCents);
  if (usd >= TIER_BID_THRESHOLDS_USD.premium.min) return "premium";
  if (usd >= TIER_BID_THRESHOLDS_USD.video.min) return "video";
  if (usd >= TIER_BID_THRESHOLDS_USD.audio_image.min) return "audio_image";
  return "audio";
}

export interface PlaceBidResult {
  bid: BidRow;
  outbid?: BidRow;
}

export class AuctionEngine {
  private closeTimer?: NodeJS.Timeout;

  constructor(
    private readonly ledger: Ledger,
    private readonly bus: EventBus,
    private readonly opts: {
      auctionDurationSec: number;
      thresholdFraction: number;
      now?: () => number;
      setTimeout?: (fn: () => void, ms: number) => NodeJS.Timeout;
      onWinner?: (winner: BidRow, segment: SegmentRow) => void;
    },
  ) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** The open auction, if any. */
  openAuction(): AuctionRow | undefined {
    for (const auction of this.ledger.auctions.values()) {
      if (auction.status === "open") return auction;
    }
    return undefined;
  }

  auctionForSlot(slot: number): AuctionRow | undefined {
    return this.ledger.auctions.get(slot);
  }

  nextSlotNumber(): number {
    let max = 0;
    for (const slot of this.ledger.auctions.keys()) max = Math.max(max, slot);
    return max + 1;
  }

  /** Open (or return) the current auction for the next slot. */
  ensureOpenAuction(): AuctionRow {
    const existing = this.openAuction();
    if (existing) return existing;
    const slot = this.nextSlotNumber();
    const auction: AuctionRow = {
      slot,
      status: "open",
      openingCents: OPENING_PRICE_CENTS,
      incrementCents: MIN_INCREMENT_CENTS,
      closesAtMs: this.now() + this.opts.auctionDurationSec * 1000,
    };
    this.ledger.auctions.set(slot, auction);
    this.scheduleClose(auction);
    return auction;
  }

  private scheduleClose(auction: AuctionRow): void {
    const setTimeoutFn = this.opts.setTimeout ?? setTimeout;
    const delay = Math.max(auction.closesAtMs - this.now(), 0);
    this.closeTimer = setTimeoutFn(() => {
      const current = this.auctionForSlot(auction.slot);
      if (current?.status === "open" && this.now() >= current.closesAtMs) {
        this.closeAuction(auction.slot);
      }
    }, delay);
    this.closeTimer.unref?.();
  }

  /** Current standing bid for a slot (highest pending). */
  standingBid(slot: number): BidRow | undefined {
    return this.ledger.pendingBidsForSlot(slot)[0];
  }

  /** Minimum acceptable bid right now: opening price, or standing + increment. */
  nextSlotPriceCents(auction: AuctionRow): number {
    const standing = this.standingBid(auction.slot);
    return standing
      ? standing.amountCents + auction.incrementCents
      : auction.openingCents;
  }

  /** Place or raise a bid. Reserves funds, emits bid.* + leaderboard events. */
  placeBid(brand: BrandRow, amountUsd: number): PlaceBidResult {
    const auction = this.ensureOpenAuction();
    assert(auction.status === "open", 409, "auction is not open");
    assert(
      this.now() < auction.closesAtMs,
      409,
      "auction already closed; wait for the next slot",
    );

    const amountCents = usdToCents(amountUsd);
    const minCents = this.nextSlotPriceCents(auction);
    assert(
      amountCents >= minCents,
      409,
      `bid must be at least ${centsToUsd(minCents).toFixed(2)} USD (current minimum)`,
    );

    const balance = this.ledger.balances.get(brand.id);
    assert(balance, 404, "brand has no balance; top up first");
    const previousStanding = this.standingBid(auction.slot);
    // Replacing your own standing bid only reserves the delta.
    const priorReservedByBrand =
      previousStanding?.brandId === brand.id ? previousStanding.amountCents : 0;
    const additionalReserve = amountCents - priorReservedByBrand;
    assert(
      balance.availableCents >= additionalReserve,
      402,
      `insufficient balance: need ${centsToUsd(Math.max(additionalReserve, 0)).toFixed(2)} USD available`,
    );

    balance.availableCents -= additionalReserve;
    balance.reservedCents += additionalReserve;

    const nowIso = isoNow();
    let outbid: BidRow | undefined;

    if (previousStanding && previousStanding.brandId === brand.id) {
      // Same brand raising its own standing bid.
      previousStanding.amountCents = amountCents;
      previousStanding.tier = tierForAmount(amountCents);
      previousStanding.updatedAt = nowIso;
      this.bus.publish({
        type: "bid.placed",
        bidId: previousStanding.id,
        brandId: brand.id,
        amountUsd: centsToUsd(amountCents),
        slot: auction.slot,
      });
      this.publishLeaderboard(auction.slot);
      return { bid: previousStanding };
    }

    const bid: BidRow = {
      id: newId("bid"),
      brandId: brand.id,
      slot: auction.slot,
      amountCents,
      tier: tierForAmount(amountCents),
      status: "pending",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.ledger.bids.set(bid.id, bid);
    this.bus.publish({
      type: "bid.placed",
      bidId: bid.id,
      brandId: brand.id,
      amountUsd: centsToUsd(amountCents),
      slot: auction.slot,
    });

    if (previousStanding) {
      // A different brand overtakes: displace the standing bid, release its hold.
      outbid = previousStanding;
      outbid.status = "lost";
      outbid.updatedAt = nowIso;
      this.releaseReservation(outbid);
      this.bus.publish({
        type: "bid.outbid",
        slot: auction.slot,
        displacedBidId: outbid.id,
        displacedBrandId: outbid.brandId,
        newBidId: bid.id,
        newBrandId: bid.brandId,
        prevAmountUsd: centsToUsd(outbid.amountCents),
        newAmountUsd: centsToUsd(bid.amountCents),
      });
    }

    this.publishLeaderboard(auction.slot);
    return { bid, outbid };
  }

  /** Return a bid's reservation to its brand's available balance. */
  private releaseReservation(bid: BidRow): void {
    const balance = this.ledger.balances.get(bid.brandId);
    if (!balance) return;
    balance.reservedCents -= bid.amountCents;
    balance.availableCents += bid.amountCents;
  }

  /** Ranked leaderboard for a slot's pending bids; emits leaderboard.updated. */
  private publishLeaderboard(slot: number): void {
    const auction = this.auctionForSlot(slot);
    const ranking: LeaderboardEntry[] = this.ledger
      .pendingBidsForSlot(slot)
      .map((b) => ({
        brandId: b.brandId,
        amountUsd: centsToUsd(b.amountCents),
      }));
    this.bus.publish({
      type: "leaderboard.updated",
      ranking,
      nextSlotPriceUsd: centsToUsd(
        auction ? this.nextSlotPriceCents(auction) : OPENING_PRICE_CENTS,
      ),
    });
  }

  leaderboardForSlot(slot: number): LeaderboardEntry[] {
    return this.ledger.pendingBidsForSlot(slot).map((b) => ({
      brandId: b.brandId,
      amountUsd: centsToUsd(b.amountCents),
    }));
  }

  /**
   * Resolve the open auction: mark the winner, release losers, realize the slot
   * as a queued segment, and hand it to the orchestrator via onWinner.
   */
  closeAuction(slot: number): BidRow | null {
    const auction = this.auctionForSlot(slot);
    assert(
      auction && auction.status === "open",
      409,
      `no open auction for slot ${slot}`,
    );
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = undefined;
    }
    auction.status = "closed";

    const winner = this.standingBid(slot);
    const losers = this.ledger
      .pendingBidsForSlot(slot)
      .filter((b) => b.id !== winner?.id);
    for (const loser of losers) {
      loser.status = "lost";
      this.releaseReservation(loser);
    }

    if (!winner) {
      // No bids: the slot still streams as a free (scraped) segment.
      this.ensureOpenAuction();
      return null;
    }

    winner.status = "won";
    const segment = this.realizeSegment(winner, auction);
    winner.segmentId = segment.id;
    auction.winnerBidId = winner.id;
    this.publishLeaderboard(slot);
    this.opts.onWinner?.(winner, segment);

    // Immediately open the next auction so the market never stalls.
    this.ensureOpenAuction();
    return winner;
  }

  /** Realize a winning bid's slot as a queued segment (free segments have no bid). */
  realizeSegment(winner: BidRow | null, auction: AuctionRow): SegmentRow {
    const segment: SegmentRow = {
      id: newId("seg"),
      slot: auction.slot,
      brandId: winner?.brandId ?? null,
      bidId: winner?.id ?? null,
      status: "queued",
      durationSec: 30,
      summary: "",
      thresholdFraction: this.opts.thresholdFraction,
      windowClosed: false,
    };
    this.ledger.segments.set(segment.id, segment);
    return segment;
  }

  /** Build the AuctionState read shape the orchestrator polls. */
  auctionState(slot: number): AuctionState | null {
    const auction = this.auctionForSlot(slot);
    if (!auction) return null;
    const standing = this.standingBid(slot);
    const winnerBid = auction.winnerBidId
      ? this.ledger.bids.get(auction.winnerBidId)
      : undefined;
    const winnerBrand = winnerBid
      ? this.ledger.brands.get(winnerBid.brandId)
      : undefined;
    return {
      slot: auction.slot,
      status: auction.status,
      closesAt: new Date(auction.closesAtMs).toISOString(),
      nextSlotPriceUsd: centsToUsd(this.nextSlotPriceCents(auction)),
      standing: standing
        ? {
            bidId: standing.id,
            brandId: standing.brandId,
            amountUsd: centsToUsd(standing.amountCents),
            tier: standing.tier,
          }
        : undefined,
      winner: winnerBid
        ? {
            bidId: winnerBid.id,
            brandId: winnerBid.brandId,
            amountUsd: centsToUsd(winnerBid.amountCents),
            tier: winnerBid.tier,
            brief: winnerBrand?.brief ?? "",
            segmentId: winnerBid.segmentId ?? "",
          }
        : undefined,
    };
  }
}
