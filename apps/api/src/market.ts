// Accounts and balances (Lane 2). Brand creation, top-ups, and listener
// sessions. Stripe is the only fiat rail (docs/technical/backend.md — Money
// architecture); for the hackathon the charge is mocked and credits the
// brand balance immediately.

import {
  LISTENER_PAYOUT_MINIMUM_USD,
  type BrandSummary,
  type CreateBrandCommand,
  type ListenerSession,
  type PayoutReceipt,
  type TopUpCommand,
} from "@slopstream/shared";
import { isoNow, newId, newToken } from "./ids.js";
import type {
  BrandBalanceRow,
  BrandRow,
  Ledger,
  ListenerPayoutRow,
  ListenerSessionRow,
} from "./ledger.js";
import { assert, centsToUsd, usdToCents } from "./money.js";

export interface BalanceView {
  brandId: string;
  availableUsd: number;
  reservedUsd: number;
  spentUsd: number;
}

/** Mock-Stripe charge record. Real Stripe checkout replaces this seam later. */
export interface MockCharge {
  id: string;
  provider: "mock-stripe";
  brandId: string;
  amountUsd: number;
  status: "succeeded";
  createdAt: string;
}

export function toBrandSummary(brand: BrandRow): BrandSummary {
  return {
    id: brand.id,
    name: brand.name,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
  };
}

export function toBalanceView(balance: BrandBalanceRow): BalanceView {
  return {
    brandId: balance.brandId,
    availableUsd: centsToUsd(balance.availableCents),
    reservedUsd: centsToUsd(balance.reservedCents),
    spentUsd: centsToUsd(balance.spentCents),
  };
}

export function computePendingBalanceCents(
  ledger: Ledger,
  sessionId: string,
): number {
  let pending = 0;
  for (const event of ledger.attentionEvents.values()) {
    if (event.listenerSessionId !== sessionId || event.result !== "valid") {
      continue;
    }
    const segment = ledger.segments.get(event.segmentId);
    if (!segment || segment.windowClosed || segment.status !== "playing") {
      continue;
    }
    pending += event.estimatedRewardCents ?? 0;
  }
  return pending;
}

export function toListenerSession(
  row: ListenerSessionRow,
  ledger: Ledger,
): ListenerSession {
  return {
    id: row.id,
    joinedAt: row.joinedAt,
    availableBalanceUsd: centsToUsd(row.balanceCents),
    pendingBalanceUsd: centsToUsd(computePendingBalanceCents(ledger, row.id)),
    todayVerifiedUsd: centsToUsd(row.todayVerifiedCents),
  };
}

export class MarketService {
  constructor(private readonly ledger: Ledger) {}

  createBrand(
    cmd: CreateBrandCommand,
    identity?: { id: string; token: string },
  ): { brand: BrandRow; token: string } {
    assert(
      typeof cmd?.name === "string" && cmd.name.trim().length > 0,
      400,
      "name is required",
    );
    assert(
      typeof cmd?.primaryColor === "string" &&
        cmd.primaryColor.trim().length > 0,
      400,
      "primaryColor is required",
    );
    assert(
      typeof cmd?.secondaryColor === "string" &&
        cmd.secondaryColor.trim().length > 0,
      400,
      "secondaryColor is required",
    );
    assert(
      typeof cmd?.brief === "string" && cmd.brief.trim().length > 0,
      400,
      "brief is required",
    );

    const brand: BrandRow = {
      id: identity?.id ?? newId("brand"),
      name: cmd.name.trim(),
      primaryColor: cmd.primaryColor.trim(),
      secondaryColor: cmd.secondaryColor.trim(),
      brief: cmd.brief.trim(),
      token: identity?.token ?? newToken(),
      createdAt: isoNow(),
    };
    assert(!this.ledger.brands.has(brand.id), 409, "brand id already exists");
    assert(
      !this.ledger.brandTokens.has(brand.token),
      409,
      "brand token already exists",
    );
    this.ledger.brands.set(brand.id, brand);
    this.ledger.brandTokens.set(brand.token, brand.id);
    this.ledger.balances.set(brand.id, {
      brandId: brand.id,
      availableCents: 0,
      reservedCents: 0,
      spentCents: 0,
    });
    return { brand, token: brand.token };
  }

  /** Mock-Stripe top-up: "charge" succeeds instantly and credits the balance. */
  topUp(cmd: TopUpCommand): { charge: MockCharge; balance: BalanceView } {
    assert(typeof cmd?.brandId === "string", 400, "brandId is required");
    const brand = this.ledger.brands.get(cmd.brandId);
    assert(brand, 404, `unknown brand ${cmd.brandId}`);
    const amountCents = usdToCents(cmd.amountUsd);
    assert(amountCents > 0, 400, "amountUsd must be positive");
    assert(
      amountCents <= 1_000_000_00,
      400,
      "amountUsd exceeds the hackathon top-up cap",
    );

    const balance = this.ledger.balances.get(brand.id)!;
    balance.availableCents += amountCents;

    const charge: MockCharge = {
      id: newId("chp"),
      provider: "mock-stripe",
      brandId: brand.id,
      amountUsd: centsToUsd(amountCents),
      status: "succeeded",
      createdAt: isoNow(),
    };
    return { charge, balance: toBalanceView(balance) };
  }

  /** Credit a brand balance from a verified Stripe webhook. */
  creditFromStripe(brandId: string, amountCents: number): BalanceView {
    const brand = this.ledger.brands.get(brandId);
    assert(brand, 404, `unknown brand ${brandId}`);
    assert(amountCents > 0, 400, "amount must be positive");
    const balance = this.ledger.balances.get(brand.id)!;
    balance.availableCents += amountCents;
    return toBalanceView(balance);
  }

  /** Create or resume a listener session (bearer token = identity). */
  createListenerSession(
    resumed?: ListenerSessionRow,
    commitment?: string,
  ): {
    session: ListenerSessionRow;
    token: string;
    resumed: boolean;
  } {
    if (resumed) {
      assert(
        !commitment || commitment === resumed.commitment,
        403,
        "listener commitment does not match this session",
      );
      resumed.lastSeenAtMs = Date.now();
      return { session: resumed, token: resumed.token, resumed: true };
    }
    const token = newToken();
    const session: ListenerSessionRow = {
      id: newId("lstn"),
      token,
      commitment: commitment ?? token,
      joinedAt: isoNow(),
      lastSeenAtMs: Date.now(),
      balanceCents: 0,
      todayVerifiedCents: 0,
      validProofs: 0,
      invalidProofs: 0,
    };
    this.ledger.listeners.set(session.id, session);
    this.ledger.listenerTokens.set(session.token, session.id);
    return { session, token: session.token, resumed: false };
  }

  /**
   * Stub payout rail: debit available balance and record a completed payout.
   * Pending rewards cannot be withdrawn until a segment clears.
   */
  requestPayout(
    session: ListenerSessionRow,
    amountUsd?: number,
  ): PayoutReceipt {
    session.lastSeenAtMs = Date.now();
    assert(session.balanceCents > 0, 400, "no available balance to withdraw");
    const amountCents =
      amountUsd === undefined ? session.balanceCents : usdToCents(amountUsd);
    assert(amountCents > 0, 400, "amountUsd must be positive");
    assert(
      amountCents >= usdToCents(LISTENER_PAYOUT_MINIMUM_USD),
      400,
      `minimum payout is $${LISTENER_PAYOUT_MINIMUM_USD.toFixed(2)}`,
    );
    assert(
      amountCents <= session.balanceCents,
      400,
      "amount exceeds available balance",
    );
    session.balanceCents -= amountCents;
    const payout: ListenerPayoutRow = {
      id: newId("pout"),
      listenerSessionId: session.id,
      amountCents,
      status: "completed",
      createdAt: isoNow(),
    };
    this.ledger.listenerPayouts.set(payout.id, payout);
    // Non-blocking notification for optional webhook / Stripe Connect payout
    // integration (Phase 3). Ignored failures must not block the payout.
    this.notifyPayoutOutbox(payout, session.id).catch(() => {});
    return {
      payoutId: payout.id,
      amountUsd: centsToUsd(amountCents),
      status: "completed",
      createdAt: payout.createdAt,
    };
  }

  listPayouts(sessionId: string): PayoutReceipt[] {
    return [...this.ledger.listenerPayouts.values()]
      .filter((payout) => payout.listenerSessionId === sessionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((payout) => ({
        payoutId: payout.id,
        amountUsd: centsToUsd(payout.amountCents),
        status: payout.status,
        createdAt: payout.createdAt,
      }));
  }

  /**
   * Minimal webhook outbox so a future Stripe Connect payout adapter can
   * dequeue and dispatch. Right now this is a no-op on success; it exists
   * so the dispatch path is a first-class concern rather than bolted on.
   */
  async notifyPayoutOutbox(
    payout: ListenerPayoutRow,
    sessionId: string,
  ): Promise<void> {
    // Reserved for Stripe Connect payout dispatch / webhook ack.
  }
}
