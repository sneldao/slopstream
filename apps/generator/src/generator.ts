import {
  isMediaManifest,
  isPublicMediaUrl,
  type GenerationRequest,
  type GenerationResult,
  type ProductionTier,
} from "@slopstream/shared";

const STUB_AUDIO_KEY = "approval-sample-002.mp3";
const STUB_AUDIO_SHA256 =
  "a1c390b9af58d99270f2a17276b031298e1ede4d4f9c53067135552f78355773";
const STUB_VISUAL_KEY = "seg_verify_clean.png";
const STUB_VISUAL_SHA256 =
  "71f3d648dd0d980c6c25b42d61843d1c84269a82bd4c32edc545e3cd6bcc347b";

function publicStubAssetBaseUrl(value: string | undefined): string {
  if (!isPublicMediaUrl(value)) {
    throw new Error(
      "ASSET_BASE_URL must be a queryless public HTTPS URL when GENERATOR_MODE=stub",
    );
  }
  return new URL(value).toString().replace(/\/$/, "");
}

function manifestForStub(
  baseUrl: string,
  tier: ProductionTier,
  durationSec: number,
) {
  const audioUrl = `${baseUrl}/assets/${STUB_AUDIO_KEY}`;
  const visualUrl = `${baseUrl}/assets/${STUB_VISUAL_KEY}`;
  const visual =
    tier === "audio"
      ? undefined
      : {
          url: visualUrl,
          contentType: "image/png",
          sha256: STUB_VISUAL_SHA256,
          type: "image" as const,
        };
  return {
    version: 1 as const,
    durationSec,
    audio: {
      url: audioUrl,
      contentType: "audio/mpeg",
      sha256: STUB_AUDIO_SHA256,
    },
    ...(visual ? { visual } : {}),
  };
}

/**
 * Deterministic implementation used by the local provider. It preserves the
 * public GenerationResult contract that a Daytona-backed provider must keep.
 */
export function generate(
  request: GenerationRequest,
  assetBaseUrl = process.env.ASSET_BASE_URL,
): GenerationResult {
  const publicAssetBaseUrl = publicStubAssetBaseUrl(assetBaseUrl);
  const previousContext =
    request.previousSummaries.join(" / ") || "nothing yet";
  const durationSec = 30;
  const media = manifestForStub(publicAssetBaseUrl, request.tier, durationSec);
  const assetUrl = media.visual?.url ?? media.audio.url;

  return {
    segmentId: request.segmentId,
    assetUrl,
    media,
    durationSec,
    transcript: `[stub ${request.tier} ad for ${request.brandId ?? "free company"}: ${request.brief}]`,
    summary: `[stub continuation from: ${previousContext}]`,
    visualMetadata:
      request.tier === "audio"
        ? undefined
        : { mode: "stub", tier: request.tier },
    audioMetadata: { mode: "stub", tier: request.tier },
  };
}

/** Provider seam for Daytona/model implementations. */
export interface GenerationProvider {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

export class StubGenerationProvider implements GenerationProvider {
  private readonly assetBaseUrl: string;

  constructor(assetBaseUrl = process.env.ASSET_BASE_URL) {
    this.assetBaseUrl = publicStubAssetBaseUrl(assetBaseUrl);
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    return generate(request, this.assetBaseUrl);
  }
}

function requestFingerprint(request: GenerationRequest): string {
  return JSON.stringify({
    segmentId: request.segmentId,
    brandId: request.brandId,
    brief: request.brief,
    tier: request.tier,
    previousSummaries: request.previousSummaries,
    constraints: request.constraints ?? null,
    continuityImageUrl: request.continuityImageUrl ?? null,
    marketContext: request.marketContext ?? null,
    sourceUrl: request.sourceUrl ?? null,
  });
}

interface CompletedGeneration {
  fingerprint: string;
  result: GenerationResult;
}

/** Persistence seam for a future database/queue-backed generation job store. */
export interface GenerationJobStore {
  get(segmentId: string): Promise<CompletedGeneration | undefined>;
  put(segmentId: string, completed: CompletedGeneration): Promise<void>;
}

/**
 * Bound on completed generations held in memory. Beyond this, the oldest
 * entry is evicted (Map keeps insertion order), so idempotent replay covers
 * the most recent MAX_COMPLETED_GENERATIONS segments and the store cannot
 * grow without bound.
 */
export const MAX_COMPLETED_GENERATIONS = 200;

export class InMemoryGenerationJobStore implements GenerationJobStore {
  private readonly completedBySegmentId = new Map<
    string,
    CompletedGeneration
  >();

  async get(segmentId: string): Promise<CompletedGeneration | undefined> {
    return this.completedBySegmentId.get(segmentId);
  }

  async put(segmentId: string, completed: CompletedGeneration): Promise<void> {
    this.completedBySegmentId.set(segmentId, completed);
    while (this.completedBySegmentId.size > MAX_COMPLETED_GENERATIONS) {
      const oldest = this.completedBySegmentId.keys().next().value as
        string | undefined;
      if (oldest === undefined) {
        break;
      }
      this.completedBySegmentId.delete(oldest);
    }
  }
}

export type GenerationOutcome =
  | { status: "generated" | "replayed"; result: GenerationResult }
  | { status: "conflict" };

function isGenerationResult(
  value: GenerationResult,
  segmentId: string,
): boolean {
  return (
    value.segmentId === segmentId &&
    typeof value.assetUrl === "string" &&
    value.assetUrl.length > 0 &&
    isMediaManifest(value.media) &&
    Number.isFinite(value.durationSec) &&
    value.durationSec > 0 &&
    typeof value.transcript === "string" &&
    value.transcript.length > 0 &&
    typeof value.summary === "string" &&
    value.summary.length > 0
  );
}

/**
 * Coordinates idempotency around any provider. A durable GenerationJobStore
 * can replace the default memory store without changing HTTP callers.
 */
export function createGenerationService(
  provider: GenerationProvider = new StubGenerationProvider(),
  store: GenerationJobStore = new InMemoryGenerationJobStore(),
): { generate(request: GenerationRequest): Promise<GenerationOutcome> } {
  return {
    async generate(request) {
      const fingerprint = requestFingerprint(request);
      const existing = await store.get(request.segmentId);
      if (existing) {
        return existing.fingerprint === fingerprint
          ? { status: "replayed", result: existing.result }
          : { status: "conflict" };
      }

      const result = await provider.generate(request);
      if (!isGenerationResult(result, request.segmentId)) {
        throw new Error("provider returned an invalid generation result");
      }
      await store.put(request.segmentId, { fingerprint, result });
      return { status: "generated", result };
    },
  };
}

/** @deprecated Use createGenerationService for a provider/store boundary. */
export function createStubGenerator(
  assetBaseUrl = process.env.ASSET_BASE_URL,
): {
  generate(request: GenerationRequest): Promise<GenerationOutcome>;
} {
  return createGenerationService(new StubGenerationProvider(assetBaseUrl));
}
