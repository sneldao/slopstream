import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import type {
  AttentionProofVerificationRequest,
  AttentionProofVerificationResult,
} from "@slopstream/shared";

import { createStubAttentionProofVerifier } from "./stubVerifier.js";

const MAX_REQUEST_BYTES = 64 * 1024;
const configuredMode = process.env.VERIFIER_MODE ?? "stub";

if (configuredMode !== "stub") {
  throw new Error(
    `Unsupported VERIFIER_MODE=${configuredMode}. Only "stub" is implemented; refusing to mislabel a JSON verifier as Midnight.`,
  );
}

type UnknownRecord = Record<string, unknown>;
type HealthResponse = { ok: true; service: string; verifierMode: "stub" };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseVerificationRequest(
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
    !isFiniteNumber(challenge.validFrom) ||
    !isFiniteNumber(challenge.validUntil)
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

const verifier = createStubAttentionProofVerifier();

const server = createServer((request, response) => {
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
        const body = await readJson(request);
        const verificationRequest = parseVerificationRequest(body);
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

const port = Number(process.env.PORT ?? 4100);
server.listen(port, () => {
  console.log(
    `slopstream proof verifier listening on :${port} (${configuredMode} mode)`,
  );
});
