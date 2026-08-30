import type {
  AuctionState,
  GenerationRequest,
  GenerationResult,
} from "@slopstream/shared";

type Winner = NonNullable<AuctionState["winner"]>;
type FetchLike = typeof fetch;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function isGenerationResult(
  value: unknown,
  segmentId: string,
): value is GenerationResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    result.segmentId === segmentId &&
    typeof result.assetUrl === "string" &&
    result.assetUrl.length > 0 &&
    typeof result.durationSec === "number" &&
    Number.isFinite(result.durationSec) &&
    result.durationSec > 0 &&
    typeof result.transcript === "string" &&
    result.transcript.length > 0 &&
    typeof result.summary === "string" &&
    result.summary.length > 0
  );
}

/**
 * Lane 3's narrow handoff for a won slot. Lane 2 remains authoritative for
 * auction state, segment lifecycle persistence, challenge generation, and
 * clearing; Lane 1 only receives a GenerationRequest and returns its result.
 */
export class SegmentPreparationService {
  private readonly apiBaseUrl: string;
  private readonly generatorBaseUrl: string;

  constructor(
    apiBaseUrl: string,
    generatorBaseUrl: string,
    private readonly fetcher: FetchLike = fetch,
  ) {
    this.apiBaseUrl = trimTrailingSlash(apiBaseUrl);
    this.generatorBaseUrl = trimTrailingSlash(generatorBaseUrl);
  }

  async prepare(
    winner: Winner,
    previousSummaries: string[] = [],
  ): Promise<GenerationResult> {
    const request: GenerationRequest = {
      segmentId: winner.segmentId,
      brandId: winner.brandId,
      brief: winner.brief,
      tier: winner.tier,
      previousSummaries,
    };

    try {
      await this.postApi(`/segments/${winner.segmentId}/generating`);
      const generationResponse = await this.fetcher(
        `${this.generatorBaseUrl}/v1/generations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      if (!generationResponse.ok) {
        throw new Error(`generator responded ${generationResponse.status}`);
      }
      const result: unknown = await generationResponse.json();
      if (!isGenerationResult(result, winner.segmentId)) {
        throw new Error("generator returned an invalid or mismatched segment");
      }

      await this.postApi(`/segments/${winner.segmentId}/ready`, {
        assetUrl: result.assetUrl,
        durationSec: result.durationSec,
        summary: result.summary,
      });
      await this.postApi(`/segments/${winner.segmentId}/challenge-source`, {
        transcript: result.transcript,
        durationSec: result.durationSec,
        visualMetadata: result.visualMetadata,
        audioMetadata: result.audioMetadata,
      });
      return result;
    } catch (error) {
      // A failed generation never becomes playable; Lane 2 releases its bid
      // reservation and records the terminal outcome.
      try {
        await this.postApi(`/segments/${winner.segmentId}/failed`);
      } catch {
        // Preserve the original generation/API error for the scheduler.
      }
      throw error;
    }
  }

  private async postApi(path: string, body?: unknown): Promise<void> {
    const response = await this.fetcher(`${this.apiBaseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      throw new Error(`API ${path} responded ${response.status}`);
    }
  }
}
