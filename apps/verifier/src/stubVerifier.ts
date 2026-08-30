import { createHash } from "node:crypto";

import type {
  AttentionProofVerificationFailure,
  AttentionProofVerificationRequest,
  AttentionProofVerificationResult,
  StubAttentionProofPayload,
} from "@slopstream/shared";

const STUB_PROOF_VERSION = "slopstream.stub.attention.v1" as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseStubProof(value: string): StubAttentionProofPayload | undefined {
  try {
    const parsed: unknown = JSON.parse(value);

    if (
      !isRecord(parsed) ||
      parsed.version !== STUB_PROOF_VERSION ||
      !isNonEmptyString(parsed.listenerCommitment) ||
      !isNonEmptyString(parsed.segmentId) ||
      !isNonEmptyString(parsed.challengeId) ||
      !isNonEmptyString(parsed.nonce) ||
      !isNonEmptyString(parsed.issuedAt) ||
      typeof parsed.valid !== "boolean"
    ) {
      return undefined;
    }

    return {
      version: STUB_PROOF_VERSION,
      listenerCommitment: parsed.listenerCommitment,
      segmentId: parsed.segmentId,
      challengeId: parsed.challengeId,
      nonce: parsed.nonce,
      issuedAt: parsed.issuedAt,
      valid: parsed.valid,
    };
  } catch {
    return undefined;
  }
}

function invalid(
  failure: AttentionProofVerificationFailure,
): AttentionProofVerificationResult {
  return {
    verified: false,
    failure,
    verifierMode: "stub",
    verifiedAt: new Date().toISOString(),
  };
}

function isFiniteTimestamp(value: string): number | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function buildProofId(payload: StubAttentionProofPayload): string {
  const stableInput = [
    payload.version,
    payload.listenerCommitment,
    payload.segmentId,
    payload.challengeId,
    payload.nonce,
    payload.issuedAt,
  ].join(":");

  return `stub_${createHash("sha256").update(stableInput).digest("hex")}`;
}

/**
 * Bound on replay-tracking nonces held in memory. Once exceeded, the oldest
 * insertion is evicted (Set keeps insertion order), so replay protection
 * covers the most recent MAX_TRACKED_NONCES proofs and the set cannot grow
 * without bound.
 */
export const MAX_TRACKED_NONCES = 10_000;

/**
 * Hackathon-only verifier. It validates that a self-reported JSON stub proof
 * is bound to the expected listener/challenge/segment, was issued/submitted in
 * the challenge window, and has not reused an in-memory nonce. It deliberately
 * does not claim to provide cryptographic proof verification.
 */
export function createStubAttentionProofVerifier(): {
  verify(
    request: AttentionProofVerificationRequest,
  ): AttentionProofVerificationResult;
} {
  const usedNonces = new Set<string>();

  return {
    verify(request) {
      const payload = parseStubProof(request.submission.resultProof);
      if (!payload) {
        return invalid("malformed_proof");
      }

      if (!payload.valid) {
        return invalid("proof_marked_invalid");
      }

      const { submission, context } = request;
      if (
        payload.listenerCommitment !== submission.listenerCommitment ||
        payload.segmentId !== submission.segmentId ||
        payload.challengeId !== submission.challengeId ||
        context.challenge.id !== submission.challengeId ||
        context.challenge.segmentId !== submission.segmentId
      ) {
        return invalid("binding_mismatch");
      }

      const { validFrom, validUntil } = context.challenge;
      const segmentStartedAt = isFiniteTimestamp(context.segmentStartedAt);
      const submittedAt = isFiniteTimestamp(context.submittedAt);
      const issuedAt = isFiniteTimestamp(payload.issuedAt);
      if (
        segmentStartedAt === undefined ||
        submittedAt === undefined ||
        issuedAt === undefined ||
        !Number.isFinite(validFrom) ||
        !Number.isFinite(validUntil) ||
        validFrom < 0 ||
        validUntil < validFrom
      ) {
        return invalid("invalid_request");
      }

      const windowStart = segmentStartedAt + validFrom * 1_000;
      const windowEnd = segmentStartedAt + validUntil * 1_000;
      if (
        issuedAt < windowStart ||
        issuedAt > windowEnd ||
        submittedAt < issuedAt ||
        submittedAt > windowEnd
      ) {
        return invalid("outside_challenge_window");
      }

      if (usedNonces.has(payload.nonce)) {
        return invalid("replayed_proof");
      }

      usedNonces.add(payload.nonce);
      if (usedNonces.size > MAX_TRACKED_NONCES) {
        const oldest = usedNonces.values().next().value as string | undefined;
        if (oldest !== undefined) {
          usedNonces.delete(oldest);
        }
      }
      const verifiedAt = new Date().toISOString();

      return {
        verified: true,
        proofId: buildProofId(payload),
        verifierMode: "stub",
        verifiedAt,
      };
    },
  };
}
