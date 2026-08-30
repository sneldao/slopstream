import type {
  GenerationRequest,
  GenerationResult,
  ProductionTier,
} from "@slopstream/shared";

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
 * Deterministic implementation used by the local provider. It preserves the
 * public GenerationResult contract that a Daytona-backed provider must keep.
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

/** Provider seam for Daytona/model implementations. */
export interface GenerationProvider {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

export class StubGenerationProvider implements GenerationProvider {
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    return generate(request);
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
export function createStubGenerator(): {
  generate(request: GenerationRequest): Promise<GenerationOutcome>;
} {
  return createGenerationService();
}
