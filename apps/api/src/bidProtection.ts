import type { BidRow } from "./ledger.js";
import { ApiError } from "./money.js";

interface IdempotentBid {
  amountCents: number;
  bid: BidRow;
  recordedAtMs: number;
}

export interface BidProtectionOptions {
  maxAttempts?: number;
  windowMs?: number;
  /** Retain idempotency replay records only long enough for safe retries. */
  idempotencyTtlMs?: number;
  /** Bound process-local demo memory until durable shared storage is used. */
  maxIdempotencyEntries?: number;
  maxTrackedBrands?: number;
  now?: () => number;
}

/**
 * Process-local protection for the demo API. Production deployments must move
 * idempotency and rate-limit state to shared durable storage before scaling.
 * The bounded TTL maps prevent a long-lived demo process from retaining every
 * historical client key and inactive brand forever.
 */
export class BidProtection {
  private readonly idempotent = new Map<string, IdempotentBid>();
  private readonly attempts = new Map<string, number[]>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly idempotencyTtlMs: number;
  private readonly maxIdempotencyEntries: number;
  private readonly maxTrackedBrands: number;
  private readonly now: () => number;

  constructor(options: BidProtectionOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 12;
    this.windowMs = options.windowMs ?? 60_000;
    this.idempotencyTtlMs = options.idempotencyTtlMs ?? 24 * 60 * 60_000;
    this.maxIdempotencyEntries = options.maxIdempotencyEntries ?? 10_000;
    this.maxTrackedBrands = options.maxTrackedBrands ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  replay(
    brandId: string,
    key: string,
    amountCents: number,
  ): BidRow | undefined {
    this.pruneIdempotency(this.now());
    const saved = this.idempotent.get(this.key(brandId, key));
    if (!saved) return undefined;
    if (saved.amountCents !== amountCents) {
      throw new ApiError(
        409,
        "idempotency key was already used with a different amount",
      );
    }
    return saved.bid;
  }

  record(brandId: string, key: string, amountCents: number, bid: BidRow): void {
    const now = this.now();
    this.pruneIdempotency(now);
    const mapKey = this.key(brandId, key);
    this.idempotent.delete(mapKey);
    this.idempotent.set(mapKey, { amountCents, bid, recordedAtMs: now });
    this.trimOldest(this.idempotent, this.maxIdempotencyEntries);
  }

  checkRate(brandId: string, now = this.now()): void {
    const cutoff = now - this.windowMs;
    this.pruneAttempts(cutoff);
    const recent = (this.attempts.get(brandId) ?? []).filter(
      (at) => at > cutoff,
    );
    if (recent.length >= this.maxAttempts) {
      throw new ApiError(429, "too many bid attempts; please slow down");
    }
    recent.push(now);
    // Refresh insertion order so eviction removes the least recently used
    // inactive brand when the bounded demo map fills.
    this.attempts.delete(brandId);
    this.attempts.set(brandId, recent);
    this.trimOldest(this.attempts, this.maxTrackedBrands);
  }

  private pruneIdempotency(now: number): void {
    const cutoff = now - this.idempotencyTtlMs;
    for (const [key, saved] of this.idempotent) {
      if (saved.recordedAtMs > cutoff) break;
      this.idempotent.delete(key);
    }
  }

  private pruneAttempts(cutoff: number): void {
    for (const [brandId, attempts] of this.attempts) {
      const recent = attempts.filter((at) => at > cutoff);
      if (recent.length === 0) this.attempts.delete(brandId);
      else this.attempts.set(brandId, recent);
    }
  }

  private trimOldest<T>(map: Map<string, T>, maxEntries: number): void {
    while (map.size > maxEntries) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) return;
      map.delete(oldest);
    }
  }

  private key(brandId: string, key: string): string {
    return `${brandId}:${key}`;
  }
}
