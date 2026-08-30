import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { timingSafeEqual } from "node:crypto";

import type {
  GenerationRequest,
  GenerationResult,
  ProductionTier,
} from "@slopstream/shared";

import {
  createGenerationService,
  type GenerationProvider,
} from "./generator.js";
import type { GeneratorMode } from "./daytonaProvider.js";

const MAX_REQUEST_BYTES = 64 * 1024;
const PRODUCTION_TIERS = new Set<ProductionTier>([
  "audio",
  "audio_image",
  "video",
  "premium",
]);

type UnknownRecord = Record<string, unknown>;
type ErrorResponse = { error: "invalid_request" | "segment_conflict" };
type HealthResponse = {
  ok: true;
  service: string;
  generatorMode: GeneratorMode;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isProductionTier(value: unknown): value is ProductionTier {
  return (
    typeof value === "string" && PRODUCTION_TIERS.has(value as ProductionTier)
  );
}

export function parseGenerationRequest(
  value: unknown,
): GenerationRequest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const { segmentId, brandId, brief, tier, previousSummaries, constraints } =
    value;
  if (
    !isNonEmptyString(segmentId) ||
    (brandId !== null && !isNonEmptyString(brandId)) ||
    !isNonEmptyString(brief) ||
    !isProductionTier(tier) ||
    !Array.isArray(previousSummaries) ||
    !previousSummaries.every(isNonEmptyString) ||
    (constraints !== undefined && !isNonEmptyString(constraints))
  ) {
    return undefined;
  }

  return {
    segmentId,
    brandId,
    brief,
    tier,
    previousSummaries,
    ...(constraints === undefined ? {} : { constraints }),
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
  body: GenerationResult | ErrorResponse | HealthResponse,
): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export interface GeneratorServerOptions {
  provider?: GenerationProvider;
  generatorMode?: GeneratorMode;
  /** Optional bearer required for generation calls; health remains public. */
  apiToken?: string;
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

/** Creates an isolated generator HTTP server for Lane 3 integration. */
export function createGeneratorServer({
  provider,
  generatorMode = "stub",
  apiToken,
}: GeneratorServerOptions = {}): Server {
  const generator = createGenerationService(provider);

  return createServer((request, response) => {
    void (async () => {
      if (request.method === "GET" && request.url === "/health") {
        sendJson(response, 200, {
          ok: true,
          service: "slopstream-generator",
          generatorMode,
        });
        return;
      }

      if (request.method === "POST" && request.url === "/v1/generations") {
        if (apiToken && !hasValidBearer(request, apiToken)) {
          sendJson(response, 401, { error: "invalid_request" });
          return;
        }
        try {
          const generationRequest = parseGenerationRequest(
            await readJson(request),
          );
          if (!generationRequest) {
            sendJson(response, 400, { error: "invalid_request" });
            return;
          }

          const outcome = await generator.generate(generationRequest);
          if (outcome.status === "conflict") {
            sendJson(response, 409, { error: "segment_conflict" });
            return;
          }

          sendJson(
            response,
            outcome.status === "generated" ? 201 : 200,
            outcome.result,
          );
        } catch {
          sendJson(response, 400, { error: "invalid_request" });
        }
        return;
      }

      sendJson(response, 404, { error: "invalid_request" });
    })();
  });
}
