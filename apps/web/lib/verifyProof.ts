/**
 * Pure input handling for `/verify`, kept out of the page so the guards that
 * decide "no record" vs "state unread" are testable without a browser.
 */

const NULLIFIER_HEX_LENGTH = 64;
const NULLIFIER_HEX = new RegExp(`^[0-9a-f]{${NULLIFIER_HEX_LENGTH}}$`);

/**
 * A contract address is interpolated into the indexer's GraphQL query string,
 * so it is allowlisted rather than escaped: identifiers here are alphanumerics
 * plus a few separators, and never a quote, brace or whitespace.
 */
const ADDRESS = /^[A-Za-z0-9_.:-]{1,200}$/;

/** Strips the receipt prefixes (`midnight_`, `0x`) and lowercases. */
export function normalizeNullifier(input: string): string | null {
  const n = input
    .trim()
    .toLowerCase()
    .replace(/^midnight_/, "")
    .replace(/^0x/, "");
  return NULLIFIER_HEX.test(n) ? n : null;
}

export function isValidContractAddress(input: string): boolean {
  return ADDRESS.test(input.trim());
}

/** GraphQL body for the public indexer. Address must already be validated. */
export function contractStateQuery(contractAddress: string): string {
  return JSON.stringify({
    query: `{ contractState(address: "${contractAddress.trim()}") { data } }`,
  });
}

export type IndexerOutcome =
  | { kind: "found"; nullifier: string; stateData: string }
  | { kind: "not-found"; stateData: string }
  | { kind: "unread" };

/**
 * Distinguishes "the chain has no such record" from "we could not read the
 * chain". A missing token, an HTTP error, or a malformed payload is never
 * allowed to present as an absent proof.
 */
export function readNullifierWindow(
  payload: unknown,
  nullifier: string,
): IndexerOutcome {
  const stateData = (
    payload as { data?: { contractState?: { data?: string } } }
  )?.data?.contractState?.data;
  if (typeof stateData !== "string") return { kind: "unread" };
  return stateData.includes(nullifier)
    ? { kind: "found", nullifier, stateData }
    : { kind: "not-found", stateData };
}
