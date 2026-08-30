import type { GenerationRequest, GenerationResult } from "@slopstream/shared";

// Daytona generation pipeline (Lane 1).
// brand brief + tier + previous summaries -> LLM script -> TTS -> image.
// Each run happens in a disposable sandbox that is destroyed after.
// Until the real pipeline lands, generate() returns a stub result so
// Lane 3 can integrate against the shared contract immediately.

export function generate(request: GenerationRequest): GenerationResult {
  return {
    segmentId: `seg_stub_${request.brandId ?? "free"}`,
    assetUrl: "https://placeholders.slopstream.local/stub.mp4",
    durationSec: 30,
    transcript: `[stub transcript for tier=${request.tier}]`,
    summary: `[stub summary continuing from: ${request.previousSummaries.join(" / ") || "nothing yet"}]`,
  };
}

console.log("slopstream generator up (stub pipeline)");
