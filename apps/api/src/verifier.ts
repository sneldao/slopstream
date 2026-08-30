// Proof verification — the Lane 1 boundary.
// Lane 2 persists the submission, hands it to a ProofVerifier, and records the
// outcome; it never grades proofs itself in production. For the hackathon the
// default is the JSON-stub verifier (docs/hackathon/team-split.md — "stubs
// everywhere"): `resultProof` is a JSON blob carrying the answer + timing, and
// the stub grades it against the backend-held Challenge. PROOF_VERIFIER_MODE=remote
// forwards to Lane 1's verifier service instead.

import type { AttentionProofSubmission } from "@slopstream/shared";
import { newId } from "./ids.js";
import type { ChallengeRow } from "./ledger.js";

export interface VerificationOutcome {
  verified: boolean;
  proofId?: string;
  reason?: string;
  /** Seconds from segment start when the answer was given, if carried. */
  answeredAtSec?: number;
}

export interface ProofVerifier {
  verify(
    submission: AttentionProofSubmission,
    challenge: ChallengeRow,
  ): Promise<VerificationOutcome>;
}

interface StubProofPayload {
  answer?: unknown;
  answeredAtSec?: unknown;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The JSON-stub verifier. Replay resistance and timing binding live here. */
export class StubProofVerifier implements ProofVerifier {
  async verify(
    submission: AttentionProofSubmission,
    challenge: ChallengeRow,
  ): Promise<VerificationOutcome> {
    let payload: StubProofPayload;
    try {
      payload = JSON.parse(
        Buffer.from(submission.resultProof, "base64url").toString("utf8"),
      );
    } catch {
      try {
        payload = JSON.parse(submission.resultProof);
      } catch {
        return { verified: false, reason: "malformed resultProof" };
      }
    }

    if (typeof payload.answer !== "string") {
      return { verified: false, reason: "resultProof missing answer" };
    }

    const answeredAtSec =
      typeof payload.answeredAtSec === "number" &&
      Number.isFinite(payload.answeredAtSec)
        ? payload.answeredAtSec
        : undefined;

    // Challenge-timing binding: the answer must fall inside the validity window.
    if (answeredAtSec !== undefined) {
      if (
        answeredAtSec < challenge.validFrom ||
        answeredAtSec > challenge.validUntil
      ) {
        return {
          verified: false,
          reason: "answer outside validity window",
          answeredAtSec,
        };
      }
    }

    // Segment binding is enforced by the caller (submission.segmentId must match
    // challenge.segmentId) before verification runs.

    if (normalize(payload.answer) !== normalize(challenge.answer)) {
      return { verified: false, reason: "incorrect answer", answeredAtSec };
    }

    return { verified: true, proofId: newId("proof"), answeredAtSec };
  }
}

/** Forwards verification to Lane 1's verifier service (PROOF_VERIFIER_URL). */
export class RemoteProofVerifier implements ProofVerifier {
  constructor(private readonly url: string) {}

  async verify(
    submission: AttentionProofSubmission,
    challenge: ChallengeRow,
  ): Promise<VerificationOutcome> {
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submission,
          // Lane 1's verifier needs the validity window for timing binding;
          // the answer itself never leaves Lane 2 in the remote design.
          validFrom: challenge.validFrom,
          validUntil: challenge.validUntil,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok)
        return { verified: false, reason: `verifier responded ${res.status}` };
      const body = (await res.json()) as Partial<VerificationOutcome>;
      return {
        verified: body.verified === true,
        proofId: body.proofId,
        reason: body.reason,
        answeredAtSec: body.answeredAtSec,
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
