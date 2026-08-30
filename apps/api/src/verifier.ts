// Proof verification — the Lane 1 boundary.
// Lane 2 owns the answer and grades it privately in BOTH modes; what crosses
// the wire to Lane 1 is only the attestation + timing/binding facts, never the
// answer (docs/hackathon/progress.md — Lane 1 handoffs).
//
// - stub mode (default): Lane 2 grades the listener's answer locally and
//   issues the receipt itself. No Lane 1 round-trip.
// - remote mode: Lane 2 grades the answer, and ONLY if it is correct issues
//   the server-side stub attestation via createServerStubAttentionProof, then
//   forwards the full AttentionProofVerificationRequest to Lane 1's verifier
//   service, which enforces binding, timing, and nonce replay. The browser
//   never constructs the attestation.

import { randomUUID } from "node:crypto";
import type {
  AttentionProofSubmission,
  AttentionProofVerificationContext,
  AttentionProofVerificationRequest,
  AttentionProofVerificationResult,
} from "@slopstream/shared";
import { createServerStubAttentionProof } from "@slopstream/shared";
import { newId } from "./ids.js";
import type { ChallengeRow } from "./ledger.js";

export interface VerificationOutcome {
  verified: boolean;
  proofId?: string;
  reason?: string;
  /** Seconds from segment start when the answer was given, if carried. */
  answeredAtSec?: number;
  /** Receipt provenance: which implementation produced this outcome. */
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

/** The listener's response arrives as a JSON blob in `resultProof`. */
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

/**
 * Private grading against the backend-held answer: correctness + challenge
 * timing. Runs entirely inside Lane 2; the answer never leaves this process.
 */
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

  if (answeredAtSec !== undefined) {
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
  }

  if (normalize(payload.answer) !== normalize(challenge.answer)) {
    return { verified: false, answeredAtSec, reason: "incorrect answer" };
  }
  return { verified: true, answeredAtSec };
}

/** The local JSON-stub verifier: grades and issues the receipt in-process. */
export class StubProofVerifier implements ProofVerifier {
  async verify(
    submission: AttentionProofSubmission,
    challenge: ChallengeRow,
    _context: AttentionProofVerificationContext,
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
    return {
      verified: true,
      proofId: newId("proof"),
      answeredAtSec: grading.answeredAtSec,
      verifierMode: "stub",
    };
  }
}

/** Forwards verification to Lane 1's verifier service (PROOF_VERIFIER_URL). */
export class RemoteProofVerifier implements ProofVerifier {
  constructor(private readonly url: string) {}

  async verify(
    submission: AttentionProofSubmission,
    challenge: ChallengeRow,
    context: AttentionProofVerificationContext,
  ): Promise<VerificationOutcome> {
    // Grade privately first. An incorrect answer never reaches Lane 1 —
    // and never earns a server-issued attestation.
    const grading = gradeAnswer(submission, challenge);
    if (!grading.verified) {
      return {
        verified: false,
        reason: grading.reason,
        answeredAtSec: grading.answeredAtSec,
        verifierMode: "stub",
      };
    }

    // Server-issued attestation: fresh nonce, issued at the answered moment,
    // valid:true because Lane 2 just graded it correct. The browser's raw
    // answer blob is replaced; it never crosses the lane boundary.
    const startedMs = Date.parse(context.segmentStartedAt);
    const issuedAt =
      grading.answeredAtSec !== undefined && Number.isFinite(startedMs)
        ? new Date(startedMs + grading.answeredAtSec * 1000).toISOString()
        : context.submittedAt;
    const attestation = createServerStubAttentionProof({
      listenerCommitment: submission.listenerCommitment,
      segmentId: submission.segmentId,
      challengeId: submission.challengeId,
      nonce: randomUUID(),
      issuedAt,
    });

    const request: AttentionProofVerificationRequest = {
      submission: { ...submission, resultProof: attestation },
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
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok)
        return { verified: false, reason: `verifier responded ${res.status}` };
      const body =
        (await res.json()) as Partial<AttentionProofVerificationResult>;
      return {
        verified: body.verified === true,
        proofId: body.proofId,
        reason: body.failure,
        answeredAtSec: grading.answeredAtSec,
        verifierMode: body.verifierMode,
      };
    } catch {
      return { verified: false, reason: "verifier unreachable" };
    }
  }
}

export function createVerifier(
  mode: "stub" | "remote",
  url?: string,
): ProofVerifier {
  if (mode === "remote" && url) return new RemoteProofVerifier(url);
  return new StubProofVerifier();
}
