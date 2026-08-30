import { randomUUID } from "node:crypto";

/** Prefixed id: `bid_a1b2c3d4e5f6`. Prefixes keep logs readable across lanes. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** Opaque bearer token for brand/listener auth. Never derived from the id. */
export function newToken(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

export function isoNow(): string {
  return new Date().toISOString();
}
