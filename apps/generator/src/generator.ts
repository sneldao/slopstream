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

function requestFingerprint(request: GenerationRequest): string {
  return JSON.stringify({
    segmentId: request.segmentId,
    brandId: request.brandId,
    brief: request.brief,
    tier: request.tier,
    previousSummaries: request.previousSummaries,
    constraints: request.constraints ?? null,
  });
}

export type StubGenerationOutcome =
  | { status: "generated" | "replayed"; result: GenerationResult }
  | { status: "conflict" };

/**
 * Keeps the stub's canonical segment-ID contract safe across retries. A retry
 * with identical inputs returns the original result; an attempt to reuse an ID
 * for different content is rejected instead of silently overwriting a segment.
 * This state is intentionally process-local until a durable job store exists.
 */
export function createStubGenerator(): {
  generate(request: GenerationRequest): StubGenerationOutcome;
} {
  const resultsBySegmentId = new Map<
    string,
    { fingerprint: string; result: GenerationResult }
  >();

  return {
    generate(request) {
      const fingerprint = requestFingerprint(request);
      const existing = resultsBySegmentId.get(request.segmentId);
      if (existing) {
        return existing.fingerprint === fingerprint
          ? { status: "replayed", result: existing.result }
          : { status: "conflict" };
      }

      const result = generate(request);
      resultsBySegmentId.set(request.segmentId, { fingerprint, result });
      return { status: "generated", result };
    },
  };
}
