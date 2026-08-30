import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type {
  AttentionProofVerificationRequest,
  AttentionProofVerificationResult,
} from "@slopstream/shared";

import { createStubAttentionProofVerifier } from "./stubVerifier.js";

const MAX_REQUEST_BYTES = 64 * 1024;

type UnknownRecord = Record<string, unknown>;
type HealthResponse = { ok: true; service: string; verifierMode: "stub" };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isChallengeWindow(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseVerificationRequest(
  value: unknown,
): AttentionProofVerificationRequest | undefined {
  if (
    !isRecord(value) ||
    !isRecord(value.submission) ||
    !isRecord(value.context)
  ) {
    return undefined;
  }

  const { submission, context } = value;
  if (!isRecord(context.challenge)) {
    return undefined;
  }

  const challenge = context.challenge;
  if (
    !isNonEmptyString(submission.listenerCommitment) ||
    !isNonEmptyString(submission.segmentId) ||
    !isNonEmptyString(submission.challengeId) ||
    !isNonEmptyString(submission.resultProof) ||
    !isNonEmptyString(context.segmentStartedAt) ||
    !isNonEmptyString(context.submittedAt) ||
    !isNonEmptyString(challenge.id) ||
    !isNonEmptyString(challenge.segmentId) ||
    !isChallengeWindow(challenge.validFrom) ||
    !isChallengeWindow(challenge.validUntil) ||
    challenge.validUntil < challenge.validFrom
  ) {
    return undefined;
  }

  return {
    submission: {
      listenerCommitment: submission.listenerCommitment,
      segmentId: submission.segmentId,
      challengeId: submission.challengeId,
      resultProof: submission.resultProof,
    },
    context: {
      segmentStartedAt: context.segmentStartedAt,
      submittedAt: context.submittedAt,
      challenge: {
        id: challenge.id,
        segmentId: challenge.segmentId,
        validFrom: challenge.validFrom,
        validUntil: challenge.validUntil,
      },
    },
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error("payload_too_large");
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: AttentionProofVerificationResult | HealthResponse,
): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function invalidRequest(): AttentionProofVerificationResult {
  return {
    verified: false,
    failure: "invalid_request",
    verifierMode: "stub",
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Creates an isolated verifier HTTP server. Each server owns a dedicated
 * in-memory nonce set, which keeps the hackathon replay guarantee scoped to
 * one running verifier process and makes the transport boundary testable.
 */
export function createVerifierServer(): Server {
  const verifier = createStubAttentionProofVerifier();

  return createServer((request, response) => {
    void (async () => {
      if (request.method === "GET" && request.url === "/health") {
        sendJson(response, 200, {
          ok: true,
          service: "slopstream-verifier",
          verifierMode: "stub",
        });
        return;
      }

      if (
        request.method === "POST" &&
        request.url === "/v1/attention-proofs/verify"
      ) {
        try {
          const verificationRequest = parseVerificationRequest(
            await readJson(request),
          );
          if (!verificationRequest) {
            sendJson(response, 400, invalidRequest());
            return;
          }

          sendJson(response, 200, verifier.verify(verificationRequest));
        } catch {
          sendJson(response, 400, invalidRequest());
        }
        return;
      }

      sendJson(response, 404, invalidRequest());
    })();
  });
}
