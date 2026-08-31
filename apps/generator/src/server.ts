import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  GenerationMarketContext,
  GenerationRequest,
  GenerationResult,
  ProductionTier,
} from "@slopstream/shared";

import {
  createGenerationService,
  type GenerationJobStore,
  type GenerationProvider,
} from "./generator.js";
import type { GeneratorMode } from "./daytonaProvider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "assets");

const CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".webm": "video/webm",
};

const MAX_REQUEST_BYTES = 64 * 1024;
const IMMUTABLE_ASSET_KEY = /^[a-f0-9]{64}\.(mp3|mp4|png|jpe?g|webp|webm)$/;
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseMarketContext(value: unknown): GenerationMarketContext | null {
  if (!isRecord(value)) return null;
  if (
    value.leaderBrandId !== undefined &&
    !isNonEmptyString(value.leaderBrandId)
  ) {
    return null;
  }
  if (
    value.leaderAmountUsd !== undefined &&
    !isFiniteNumber(value.leaderAmountUsd)
  ) {
    return null;
  }
  if (value.openSlot !== undefined && !isFiniteNumber(value.openSlot)) {
    return null;
  }
  if (
    value.nextSlotPriceUsd !== undefined &&
    !isFiniteNumber(value.nextSlotPriceUsd)
  ) {
    return null;
  }
  if (
    value.verifiedCount !== undefined &&
    !isFiniteNumber(value.verifiedCount)
  ) {
    return null;
  }
  if (
    value.attentionThreshold !== undefined &&
    !isFiniteNumber(value.attentionThreshold)
  ) {
    return null;
  }
  if (
    value.attentionProgress !== undefined &&
    !isFiniteNumber(value.attentionProgress)
  ) {
    return null;
  }

  const ctx: GenerationMarketContext = {};
  if (isNonEmptyString(value.leaderBrandId)) {
    ctx.leaderBrandId = value.leaderBrandId;
  }
  if (isFiniteNumber(value.leaderAmountUsd)) {
    ctx.leaderAmountUsd = value.leaderAmountUsd;
  }
  if (isFiniteNumber(value.openSlot)) ctx.openSlot = value.openSlot;
  if (isFiniteNumber(value.nextSlotPriceUsd)) {
    ctx.nextSlotPriceUsd = value.nextSlotPriceUsd;
  }
  if (isFiniteNumber(value.verifiedCount)) {
    ctx.verifiedCount = value.verifiedCount;
  }
  if (isFiniteNumber(value.attentionThreshold)) {
    ctx.attentionThreshold = value.attentionThreshold;
  }
  if (isFiniteNumber(value.attentionProgress)) {
    ctx.attentionProgress = value.attentionProgress;
  }
  return ctx;
}

export function parseGenerationRequest(
  value: unknown,
): GenerationRequest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const {
    segmentId,
    brandId,
    brief,
    tier,
    previousSummaries,
    constraints,
    continuityImageUrl,
    marketContext,
    sourceUrl,
  } = value;
  if (
    !isNonEmptyString(segmentId) ||
    (brandId !== null && !isNonEmptyString(brandId)) ||
    !isNonEmptyString(brief) ||
    !isProductionTier(tier) ||
    !Array.isArray(previousSummaries) ||
    !previousSummaries.every(isNonEmptyString) ||
    (constraints !== undefined && !isNonEmptyString(constraints)) ||
    (continuityImageUrl !== undefined && !isNonEmptyString(continuityImageUrl))
  ) {
    return undefined;
  }

  let parsedMarket: GenerationMarketContext | undefined;
  if (marketContext !== undefined) {
    const parsed = parseMarketContext(marketContext);
    if (parsed === null) return undefined;
    parsedMarket = parsed;
  }

  // Grounding-only field: a bad URL is silently dropped, never fatal.
  const validSourceUrl =
    isNonEmptyString(sourceUrl) &&
    sourceUrl.length <= 2048 &&
    /^https?:\/\//.test(sourceUrl);

  return {
    segmentId,
    brandId,
    brief,
    tier,
    previousSummaries,
    ...(constraints === undefined ? {} : { constraints }),
    ...(continuityImageUrl === undefined ? {} : { continuityImageUrl }),
    ...(parsedMarket === undefined ? {} : { marketContext: parsedMarket }),
    ...(validSourceUrl ? { sourceUrl } : {}),
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
  /** Directory for serving generated assets. Defaults to ../assets. */
  assetsDir?: string;
  /** Persistence for completed generations. Defaults to the in-memory store. */
  jobStore?: GenerationJobStore;
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
  assetsDir = ASSETS_DIR,
  jobStore,
}: GeneratorServerOptions = {}): Server {
  const generator = createGenerationService(provider, jobStore);

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

      // Static asset serving — generated MP3s, PNGs, MP4s.
      // CORS-enabled so the web client can fetch textures cross-origin.
      if (request.method === "GET" && request.url?.startsWith("/assets/")) {
        const key = request.url.slice("/assets/".length);
        // Prevent path traversal: reject keys with .. or slashes that escape.
        if (key.includes("..") || key.includes("/")) {
          response.writeHead(403);
          response.end();
          return;
        }
        const filePath = join(assetsDir, key);
        try {
          const stats = await stat(filePath);
          if (!stats.isFile()) {
            response.writeHead(404);
            response.end();
            return;
          }
          const ext = extname(filePath).toLowerCase();
          const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
          const data = await readFile(filePath);
          response.writeHead(200, {
            "content-type": contentType,
            "content-length": data.length,
            "access-control-allow-origin": "*",
            "cache-control": IMMUTABLE_ASSET_KEY.test(key)
              ? "public, max-age=31536000, immutable"
              : "no-store",
          });
          response.end(data);
        } catch {
          response.writeHead(404);
          response.end();
        }
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
        } catch (err) {
          console.error("[generator] request failed:", err);
          sendJson(response, 400, { error: "invalid_request" });
        }
        return;
      }

      sendJson(response, 404, { error: "invalid_request" });
    })();
  });
}
