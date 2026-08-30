import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import {
  createServerStubAttentionProof,
  type AttentionProofSubmission,
  type AttentionProofVerificationContext,
  type AttentionProofVerificationRequest,
} from "@slopstream/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createVerifierServer } from "./server.js";
import { createStubAttentionProofVerifier } from "./stubVerifier.js";

const segmentStartedAt = "2026-08-30T12:00:00.000Z";
const issuedAt = "2026-08-30T12:00:05.000Z";

type RequestOverrides = {
  submission?: Partial<AttentionProofSubmission>;
  context?: Partial<Omit<AttentionProofVerificationContext, "challenge">> & {
    challenge?: Partial<AttentionProofVerificationContext["challenge"]>;
  };
};

function request(
  overrides: RequestOverrides = {},
): AttentionProofVerificationRequest {
  const submission = {
    listenerCommitment: "listener:one",
    segmentId: "segment:one",
    challengeId: "challenge:one",
    resultProof: createServerStubAttentionProof({
      listenerCommitment: "listener:one",
      segmentId: "segment:one",
      challengeId: "challenge:one",
      nonce: "nonce:one",
      issuedAt,
    }),
    ...overrides.submission,
  };
  const challenge = {
    id: "challenge:one",
    segmentId: "segment:one",
    validFrom: 5,
    validUntil: 15,
    ...overrides.context?.challenge,
  };

  return {
    submission,
    context: {
      segmentStartedAt,
      submittedAt: "2026-08-30T12:00:06.000Z",
      ...overrides.context,
      challenge,
    },
  };
}

describe("createStubAttentionProofVerifier", () => {
  it("verifies a correctly bound, timely server-issued stub proof", () => {
    const result = createStubAttentionProofVerifier().verify(request());

    expect(result).toMatchObject({
      verified: true,
      verifierMode: "stub",
      proofId: expect.stringMatching(/^stub_[a-f0-9]{64}$/),
    });
  });

  it("rejects malformed, invalid, and mismatched proofs", () => {
    const verifier = createStubAttentionProofVerifier();

    expect(
      verifier.verify(
        request({
          submission: { resultProof: "not-json" },
        }),
      ),
    ).toMatchObject({ verified: false, failure: "malformed_proof" });

    expect(
      verifier.verify(
        request({
          submission: {
            resultProof: JSON.stringify({
              version: "slopstream.stub.attention.v1",
              listenerCommitment: "listener:one",
              segmentId: "segment:one",
              challengeId: "challenge:one",
              nonce: "nonce:invalid",
              issuedAt,
              valid: false,
            }),
          },
        }),
      ),
    ).toMatchObject({ verified: false, failure: "proof_marked_invalid" });

    expect(
      verifier.verify(
        request({
          submission: {
            segmentId: "segment:other",
          },
        }),
      ),
    ).toMatchObject({ verified: false, failure: "binding_mismatch" });
  });

  it("enforces the challenge window and blocks nonce replays", () => {
    const verifier = createStubAttentionProofVerifier();

    expect(
      verifier.verify(
        request({
          context: {
            submittedAt: "2026-08-30T12:00:16.000Z",
          },
        }),
      ),
    ).toMatchObject({ verified: false, failure: "outside_challenge_window" });

    const validRequest = request();
    expect(verifier.verify(validRequest)).toMatchObject({ verified: true });
    expect(verifier.verify(validRequest)).toMatchObject({
      verified: false,
      failure: "replayed_proof",
    });
  });
});

describe("verifier HTTP boundary", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createVerifierServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );

  it("exposes health and rejects structurally invalid challenge windows", async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      verifierMode: "stub",
    });

    const invalid = request({
      context: {
        challenge: { validFrom: 15, validUntil: 5 },
      },
    });
    const response = await fetch(`${baseUrl}/v1/attention-proofs/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invalid),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      verified: false,
      failure: "invalid_request",
    });
  });
});
