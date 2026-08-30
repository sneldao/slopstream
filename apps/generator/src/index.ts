import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import type {
  GenerationRequest,
  GenerationResult,
  ProductionTier,
} from "@slopstream/shared";

const MAX_REQUEST_BYTES = 64 * 1024;
const PRODUCTION_TIERS = new Set<ProductionTier>([
  "audio",
  "audio_image",
  "video",
  "premium",
]);

type UnknownRecord = Record<string, unknown>;

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

function parseGenerationRequest(value: unknown): GenerationRequest | undefined {
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

function assetPathForTier(tier: ProductionTier): string {
  switch (tier) {
    case "audio":
      return "stub-audio.mp3";
    case "audio_image":
      return "stub-audio-image.mp4";
    case "video":
    case "premium":
      return "stub-video.mp4";
  }
}

/**
 * Stub generation implementation. The caller supplies the canonical segment
 * ID allocated by Lane 2's auction engine, and the generator always echoes it
 * back. Replace only this function when wiring Daytona + model providers; the
 * HTTP boundary and segment correlation rule stay unchanged.
 */
export function generate(request: GenerationRequest): GenerationResult {
  const assetBaseUrl = (
    process.env.ASSET_BASE_URL ?? "https://placeholders.slopstream.local"
  ).replace(/\/$/, "");
  const previousContext =
    request.previousSummaries.join(" / ") || "nothing yet";

  return {
    segmentId: request.segmentId,
    assetUrl: `${assetBaseUrl}/${assetPathForTier(request.tier)}`,
    durationSec: 30,
    transcript: `[stub ${request.tier} ad for ${request.brandId ?? "free company"}: ${request.brief}]`,
    summary: `[stub continuation from: ${previousContext}]`,
    visualMetadata:
      request.tier === "audio"
        ? undefined
        : { mode: "stub", tier: request.tier },
    audioMetadata: { mode: "stub", tier: request.tier },
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
  body:
    | GenerationResult
    | { error: "invalid_request" }
    | { ok: true; service: string },
): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  void (async () => {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { ok: true, service: "slopstream-generator" });
      return;
    }

    if (request.method === "POST" && request.url === "/v1/generations") {
      try {
        const generationRequest = parseGenerationRequest(
          await readJson(request),
        );
        if (!generationRequest) {
          sendJson(response, 400, { error: "invalid_request" });
          return;
        }

        sendJson(response, 201, generate(generationRequest));
      } catch {
        sendJson(response, 400, { error: "invalid_request" });
      }
      return;
    }

    sendJson(response, 404, { error: "invalid_request" });
  })();
});

const port = Number(process.env.PORT ?? 4300);
server.listen(port, () => {
  console.log(`slopstream generator listening on :${port} (stub mode)`);
});
