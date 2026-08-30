import { createHash } from "node:crypto";

import type {
  AttentionProofVerificationRequest,
  AttentionProofVerificationResult,
} from "@slopstream/shared";

import { createStubAttentionProofVerifier } from "./stubVerifier.js";

export interface MidnightAttentionProofRecorder {
  submitAttentionProof(
    segmentId: Uint8Array,
    challengeId: Uint8Array,
  ): Promise<{ nullifier: Uint8Array; txHash: string }>;
}

const hashIdTo32Bytes = (id: string): Uint8Array =>
  new Uint8Array(createHash("sha256").update(id).digest());

/**
 * Midnight-backed verifier. It first runs the same structural checks as the
 * stub verifier (binding, challenge window, replay), then records the accepted
 * proof on the deployed ProofOfAttention contract: the listener secret is
 * generated fresh per submission and never leaves this process, while the
 * on-chain nullifier, aggregate count, and threshold status become public
 * facts. The proofId is the on-chain nullifier.
 */
export function createMidnightAttentionProofVerifier(
  recorder: MidnightAttentionProofRecorder,
): {
  verify(
    request: AttentionProofVerificationRequest,
  ): Promise<AttentionProofVerificationResult>;
} {
  const structural = createStubAttentionProofVerifier();

  return {
    async verify(request) {
      const structuralResult = structural.verify(request);
      if (!structuralResult.verified) {
        return { ...structuralResult, verifierMode: "midnight" };
      }

      try {
        const receipt = await recorder.submitAttentionProof(
          hashIdTo32Bytes(request.submission.segmentId),
          hashIdTo32Bytes(request.submission.challengeId),
        );
        return {
          verified: true,
          proofId: `midnight_${Buffer.from(receipt.nullifier).toString("hex")}`,
          verifierMode: "midnight",
          verifiedAt: new Date().toISOString(),
        };
      } catch {
        return {
          verified: false,
          failure: "recording_failed",
          verifierMode: "midnight",
          verifiedAt: new Date().toISOString(),
        };
      }
    },
  };
}
