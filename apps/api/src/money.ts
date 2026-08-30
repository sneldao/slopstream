// Integer-cents money arithmetic.
// Rule (docs/technical/backend.md — Backend ledger): the ledger stores integer
// cents; the shared wire types expose USD as numbers; conversion happens once
// at this boundary. Never store or compute float dollars internally.

/** Convert a USD wire amount to integer cents, rejecting bad input. */
export function usdToCents(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) {
    throw new ApiError(400, "amountUsd must be a non-negative number");
  }
  return Math.round(usd * 100);
}

/** Convert integer cents back to a USD wire amount. */
export function centsToUsd(cents: number): number {
  return Math.round(cents) / 100;
}

/** Whole-percent split of cents without float drift: listener pool for a gross. */
export function splitCents(grossCents: number, fraction: number): number {
  return Math.round(grossCents * fraction);
}

/** HTTP-friendly error carrying a status code; caught once by the router. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function assert(
  cond: unknown,
  status: number,
  message: string,
): asserts cond {
  if (!cond) throw new ApiError(status, message);
}
