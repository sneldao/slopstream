// Proof verification — the Lane 1 boundary.
// Lane 2 owns the answer and grades it privately in BOTH modes; only an
// attestation plus timing/binding facts cross to Lane 1.

import { randomUUID } from "node:crypto";
import {
  createServerStubAttentionProof,
  type AttentionProofSubmission,
  type AttentionProofVerificationContext,
  type AttentionProofVerificationRequest,
  type AttentionProofVerificationResult,
} from "@slopstream/shared";
import { newId } from "./ids.js";
import type { ChallengeRow } from "./ledger.js";

export interface VerificationOutcome {
  verified: boolean;
  proofId?: string;
  reason?: string;
  answeredAtSec?: number;
  verifierMode?: "stub" | "midnight";
}

export interface ProofVerifier {
  verify(
    submission: AttentionProofSubmission,
    challenge: ChallengeRow,
    context: AttentionProofVerificationContext,
  ): Promise<VerificationOutcome>;
}

interface AnswerPayload {
  answer?: unknown;
  answeredAtSec?: unknown;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseAnswerPayload(resultProof: string): AnswerPayload | undefined {
  try {
    return JSON.parse(Buffer.from(resultProof, "base64url").toString("utf8"));
  } catch {
    try {
      return JSON.parse(resultProof);
    } catch {
      return undefined;
    }
  }
}

interface Grading {
  verified: boolean;
  answeredAtSec?: number;
  reason?: string;
}

/** Private correctness and timing grading; the listener answer stays in Lane 2. */
function gradeAnswer(
  submission: AttentionProofSubmission,
  challenge: ChallengeRow,
): Grading {
  const payload = parseAnswerPayload(submission.resultProof);
  if (!payload) return { verified: false, reason: "malformed resultProof" };
  if (typeof payload.answer !== "string") {
    return { verified: false, reason: "resultProof missing answer" };
  }

  const answeredAtSec =
    typeof payload.answeredAtSec === "number" &&
    Number.isFinite(payload.answeredAtSec)
      ? payload.answeredAtSec
      : undefined;
  if (normalize(payload.answer) !== normalize(challenge.answer)) {
    return { verified: false, answeredAtSec, reason: "incorrect answer" };
  }
  return { verified: true, answeredAtSec };
}

function serverAnswerTime(
  context: AttentionProofVerificationContext,
  challenge: ChallengeRow,
): Grading {
  const startedAtMs = Date.parse(context.segmentStartedAt);
  const submittedAtMs = Date.parse(context.submittedAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(submittedAtMs)) {
    return { verified: false, reason: "invalid verification timestamps" };
  }
  const answeredAtSec = (submittedAtMs - startedAtMs) / 1_000;
  if (
    answeredAtSec < challenge.validFrom ||
    answeredAtSec > challenge.validUntil
  ) {
    return {
      verified: false,
      answeredAtSec,
      reason: "answer outside validity window",
    };
  }
  return { verified: true, answeredAtSec };
}

export class StubProofVerifier implements ProofVerifier {
  async verify(
    submission: AttentionProofSubmission,
    challenge: ChallengeRow,
    context: AttentionProofVerificationContext,
  ): Promise<VerificationOutcome> {
    const grading = gradeAnswer(submission, challenge);
    if (!grading.verified) {
      return {
        verified: false,
        reason: grading.reason,
        answeredAtSec: grading.answeredAtSec,
        verifierMode: "stub",
      };
    }
    const timing = serverAnswerTime(context, challenge);
    if (!timing.verified) {
      return {
        verified: false,
        reason: timing.reason,
        answeredAtSec: timing.answeredAtSec,
        verifierMode: "stub",
      };
    }
    return {
      verified: true,
      proofId: newId("proof"),
      answeredAtSec: timing.answeredAtSec,
      verifierMode: "stub",
    };
  }
}

function parseRemoteResult(
  value: unknown,
): AttentionProofVerificationResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  const mode = body.verifierMode;
  if (
    typeof body.verified !== "boolean" ||
    (mode !== "stub" && mode !== "midnight") ||
    typeof body.verifiedAt !== "string"
  ) {
    return undefined;
  }
  if (body.verified) {
    if (typeof body.proofId !== "string" || body.proofId.length === 0) {
      return undefined;
    }
    return {
      verified: true,
      proofId: body.proofId,
      verifierMode: mode,
      verifiedAt: body.verifiedAt,
    };
  }
  if (typeof body.failure !== "string" || body.failure.length === 0) {
    return undefined;
  }
  return {
    verified: false,
    failure: body.failure as AttentionProofVerificationResult["failure"],
    verifierMode: mode,
    verifiedAt: body.verifiedAt,
  };
}

/** Forwards correct, server-issued attestations to the Lane 1 verifier. */
export class RemoteProofVerifier implements ProofVerifier {
  constructor(
    private readonly url: string,
    private readonly apiToken?: string,
  ) {}

  async verify(
    submission: AttentionProofSubmission,
    challenge: ChallengeRow,
    context: AttentionProofVerificationContext,
  ): Promise<VerificationOutcome> {
    const grading = gradeAnswer(submission, challenge);
    if (!grading.verified) {
      return {
        verified: false,
        reason: grading.reason,
        answeredAtSec: grading.answeredAtSec,
        verifierMode: "stub",
      };
    }
    const timing = serverAnswerTime(context, challenge);
    if (!timing.verified) {
      return {
        verified: false,
        reason: timing.reason,
        answeredAtSec: timing.answeredAtSec,
        verifierMode: "stub",
      };
    }

    const request: AttentionProofVerificationRequest = {
      submission: {
        ...submission,
        resultProof: createServerStubAttentionProof({
          listenerCommitment: submission.listenerCommitment,
          segmentId: submission.segmentId,
          challengeId: submission.challengeId,
          nonce: randomUUID(),
          issuedAt: context.submittedAt,
        }),
      },
      context: {
        ...context,
        challenge: {
          id: challenge.id,
          segmentId: challenge.segmentId,
          validFrom: challenge.validFrom,
          validUntil: challenge.validUntil,
        },
      },
    };
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (this.apiToken) headers.authorization = `Bearer ${this.apiToken}`;
      const response = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        return {
          verified: false,
          reason: `verifier responded ${response.status}`,
        };
      }
      const result = parseRemoteResult(await response.json());
      if (!result)
        return { verified: false, reason: "invalid verifier response" };
      return {
        verified: result.verified,
        proofId: result.proofId,
        reason: result.failure,
        answeredAtSec: timing.answeredAtSec,
        verifierMode: result.verifierMode,
      };
    } catch {
      return { verified: false, reason: "verifier unreachable" };
    }
  }
}

export function createVerifier(
  mode: "stub" | "remote",
  url?: string,
  apiToken?: string,
): ProofVerifier {
  if (mode === "stub") return new StubProofVerifier();
  if (!url) throw new Error("PROOF_VERIFIER_URL is required in remote mode");
  return new RemoteProofVerifier(url, apiToken);
}
