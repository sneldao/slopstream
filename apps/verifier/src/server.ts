import { timingSafeEqual } from "node:crypto";
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
type HealthResponse = {
  ok: true;
  service: string;
  verifierMode: "stub" | "midnight";
};

export interface AttentionProofVerifier {
  verify(
    request: AttentionProofVerificationRequest,
  ):
    | AttentionProofVerificationResult
    | Promise<AttentionProofVerificationResult>;
}

export interface VerifierServerOptions {
  /** Optional shared bearer token for Lane 2 → Lane 1 calls. */
  apiToken?: string;
  /** Verifier implementation; defaults to the JSON-stub verifier. */
  verifier?: AttentionProofVerifier;
  /** Reported on /health and on invalid-request results. */
  verifierMode?: "stub" | "midnight";
}

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

function hasValidBearer(
  request: IncomingMessage,
  expectedToken: string,
): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? "");
  if (!match) return false;
  const received = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
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

function invalidRequest(
  mode: "stub" | "midnight",
): AttentionProofVerificationResult {
  return {
    verified: false,
    failure: "invalid_request",
    verifierMode: mode,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Creates an isolated verifier HTTP server. Each server owns a dedicated
 * in-memory nonce set, which keeps the hackathon replay guarantee scoped to
 * one running verifier process and makes the transport boundary testable.
 */
export function createVerifierServer(
  options: VerifierServerOptions = {},
): Server {
  const verifier = options.verifier ?? createStubAttentionProofVerifier();
  const mode = options.verifierMode ?? "stub";

  return createServer((request, response) => {
    void (async () => {
      if (request.method === "GET" && request.url === "/health") {
        sendJson(response, 200, {
          ok: true,
          service: "slopstream-verifier",
          verifierMode: mode,
        });
        return;
      }

      if (
        request.method === "POST" &&
        request.url === "/v1/attention-proofs/verify"
      ) {
        if (options.apiToken && !hasValidBearer(request, options.apiToken)) {
          sendJson(response, 401, invalidRequest(mode));
          return;
        }
        try {
          const verificationRequest = parseVerificationRequest(
            await readJson(request),
          );
          if (!verificationRequest) {
            sendJson(response, 400, invalidRequest(mode));
            return;
          }

          sendJson(response, 200, await verifier.verify(verificationRequest));
        } catch {
          sendJson(response, 400, invalidRequest(mode));
        }
        return;
      }

      sendJson(response, 404, invalidRequest(mode));
    })();
  });
}
