import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  GenerationRequest,
  GenerationResult,
  ProductionTier,
} from "@slopstream/shared";

import type { GenerationProvider } from "./generator.js";
import {
  pickFormat,
  voiceForFormat,
  type CreativeFormat,
} from "./creativeFormats.js";

type Environment = Readonly<Record<string, string | undefined>>;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "assets");

const WORDS_PER_SECOND = 2.5;
const IMAGE_POLL_INTERVAL_MS = 2000;
const VIDEO_POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS_IMAGE = 60; // 2 minutes
const MAX_POLL_ATTEMPTS_VIDEO = 72; // 6 minutes

const IMAGE_MODEL = "gemini-3-pro-image";
const VIDEO_MODEL = "veo-3.1-fast-generate-001";

/**
 * TTS model options. `eleven_flash_v2_5` is 50% cheaper per character than
 * `eleven_v3` — use it for initial testing to conserve credits. Switch to
 * `eleven_v3` for the most expressive delivery once the pipeline is verified.
 */
const TTS_MODELS = [
  "eleven_flash_v2_5",
  "eleven_v3",
  "eleven_multilingual_v2",
] as const;
type TtsModel = (typeof TTS_MODELS)[number];

/**
 * Tier hierarchy — used by ELEVENLABS_MAX_TIER to cap spend. If set to
 * `audio`, all requests produce audio-only regardless of the bid tier,
 * skipping image and video generation entirely.
 */
const TIER_ORDER: ProductionTier[] = [
  "audio",
  "audio_image",
  "video",
  "premium",
];

function tierRank(tier: ProductionTier): number {
  return TIER_ORDER.indexOf(tier);
}

function capTier(
  tier: ProductionTier,
  maxTier: ProductionTier,
): ProductionTier {
  return tierRank(tier) <= tierRank(maxTier) ? tier : maxTier;
}

export interface ElevenLabsProviderConfig {
  apiKey: string;
  voiceId: string;
  /** Base URL for serving assets (e.g. http://localhost:4300). */
  assetBaseUrl: string;
  /** Local directory to save generated assets. */
  assetsDir: string;
  /** TTS model — `eleven_flash_v2_5` (cheap) or `eleven_v3` (expressive). */
  ttsModel: TtsModel;
  /** Maximum tier to generate. Requests above this are downgraded. */
  maxTier: ProductionTier;
}

function requiredEnvironmentValue(
  environment: Environment,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when GENERATOR_MODE=elevenlabs`);
  }
  return value;
}

function optionalEnvironmentValue(
  environment: Environment,
  name: string,
  fallback?: string,
): string | undefined {
  const value = environment[name]?.trim();
  return value || fallback;
}

function parseTtsModel(value: string | undefined): TtsModel {
  if (value === undefined || value === "") return "eleven_flash_v2_5";
  if ((TTS_MODELS as readonly string[]).includes(value))
    return value as TtsModel;
  throw new Error(
    `ELEVENLABS_TTS_MODEL=${value} is not supported. Use one of: ${TTS_MODELS.join(", ")}`,
  );
}

function parseMaxTier(value: string | undefined): ProductionTier {
  if (value === undefined || value === "") return "premium";
  if ((TIER_ORDER as readonly string[]).includes(value))
    return value as ProductionTier;
  throw new Error(
    `ELEVENLABS_MAX_TIER=${value} is not a valid tier. Use one of: ${TIER_ORDER.join(", ")}`,
  );
}

export function createElevenLabsProviderFromEnv(
  environment: Environment,
): ElevenLabsGenerationProvider {
  const config: ElevenLabsProviderConfig = {
    apiKey: requiredEnvironmentValue(environment, "ELEVENLABS_API_KEY"),
    voiceId: requiredEnvironmentValue(environment, "ELEVENLABS_VOICE_ID"),
    assetBaseUrl: optionalEnvironmentValue(
      environment,
      "ASSET_BASE_URL",
      `http://localhost:${environment.PORT ?? 4300}`,
    )!,
    assetsDir: optionalEnvironmentValue(environment, "ASSETS_DIR", ASSETS_DIR)!,
    ttsModel: parseTtsModel(
      optionalEnvironmentValue(environment, "ELEVENLABS_TTS_MODEL"),
    ),
    maxTier: parseMaxTier(
      optionalEnvironmentValue(environment, "ELEVENLABS_MAX_TIER"),
    ),
  };
  return new ElevenLabsGenerationProvider(config);
}

/**
 * Generates ad content using ElevenLabs APIs:
 *
 * - **Script**: A template-based ad script from the brand brief. Produces a
 *   compelling 15-30 second voiceover transcript.
 * - **Voice**: ElevenLabs TTS (`textToSpeech.convert`) — model is
 *   configurable via `ELEVENLABS_TTS_MODEL` (defaults to
 *   `eleven_flash_v2_5` for cost; switch to `eleven_v3` for expression).
 * - **Image** (audio_image+): ElevenLabs image generation (`flows.image`)
 *   using `gemini-3-pro-image`.
 * - **Video** (video+): ElevenLabs video generation (`flows.video`) using
 *   `veo-3.1-fast-generate-001` with synchronized audio.
 *
 * Assets are saved locally and served by the generator's static file route.
 * The `assetUrl` in the result points to the served URL.
 *
 * For `audio` tier: assetUrl = .mp3 (the AdSurface shows the orb)
 * For `audio_image` tier: assetUrl = .png (the AdSurface shows an image plane)
 * For `video`/`premium` tier: assetUrl = .mp4 (the AdSurface shows a video plane)
 */
export class ElevenLabsGenerationProvider implements GenerationProvider {
  private readonly client: ElevenLabsClient;

  constructor(private readonly config: ElevenLabsProviderConfig) {
    this.client = new ElevenLabsClient({ apiKey: config.apiKey });
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    // Ensure the assets directory exists.
    await mkdir(this.config.assetsDir, { recursive: true });

    // Cap the tier to the configured maximum (spend mitigation).
    const tier = capTier(request.tier, this.config.maxTier);

    // Pick a creative format for this segment — rotates voices, tones, and
    // script structures so consecutive ads feel varied.
    const format = pickFormat(request.segmentId);
    const voiceId = voiceForFormat(format, this.config.voiceId);

    // Stage 1: Script — format-specific transcript from the brand brief.
    const transcript = format.script({
      brand: request.brandId ?? "this company",
      brief: request.brief.trim(),
      context: request.previousSummaries.at(-1),
    });

    // Stage 2: Voice — TTS via ElevenLabs with the format's voice.
    const audioBytes = await this.synthesizeVoice(transcript, voiceId);
    const audioKey = `${request.segmentId}.mp3`;
    await writeFile(join(this.config.assetsDir, audioKey), audioBytes);

    const durationSec = estimateDurationSec(transcript);
    const summary = summaryFor(request, format);

    // For audio tier, the asset is the MP3 itself.
    if (tier === "audio") {
      return {
        segmentId: request.segmentId,
        assetUrl: assetUrl(this.config.assetBaseUrl, audioKey),
        durationSec,
        transcript,
        summary,
        audioMetadata: {
          provider: "elevenlabs",
          voiceId,
          modelId: this.config.ttsModel,
          format: "mp3_44100_128",
          creativeFormat: format.name,
          tone: format.tone,
        },
      };
    }

    // Stage 3: Image — generate a visual for audio_image and above.
    if (tier === "audio_image") {
      const imagePrompt = imagePromptFor(request, transcript, format);
      const imageBytes = await this.generateImage(imagePrompt);
      const imageKey = `${request.segmentId}.png`;
      await writeFile(join(this.config.assetsDir, imageKey), imageBytes);

      return {
        segmentId: request.segmentId,
        assetUrl: assetUrl(this.config.assetBaseUrl, imageKey),
        durationSec,
        transcript,
        summary,
        visualMetadata: {
          provider: "elevenlabs",
          modelId: IMAGE_MODEL,
          prompt: imagePrompt,
        },
        audioMetadata: {
          provider: "elevenlabs",
          voiceId,
          modelId: this.config.ttsModel,
          format: "mp3_44100_128",
          file: audioKey,
          creativeFormat: format.name,
          tone: format.tone,
        },
      };
    }

    // Stage 4: Video — generate a video for video and premium tiers.
    const videoPrompt = videoPromptFor(request, transcript, format);
    const videoBytes = await this.generateVideo(videoPrompt, durationSec);
    const videoKey = `${request.segmentId}.mp4`;
    await writeFile(join(this.config.assetsDir, videoKey), videoBytes);

    return {
      segmentId: request.segmentId,
      assetUrl: assetUrl(this.config.assetBaseUrl, videoKey),
      durationSec,
      transcript,
      summary,
      visualMetadata: {
        provider: "elevenlabs",
        modelId: VIDEO_MODEL,
        prompt: videoPrompt,
      },
      audioMetadata: {
        provider: "elevenlabs",
        voiceId,
        modelId: this.config.ttsModel,
        format: "mp3_44100_128",
        file: audioKey,
        creativeFormat: format.name,
        tone: format.tone,
      },
    };
  }

  // --- ElevenLabs API calls ---

  private async synthesizeVoice(
    text: string,
    voiceId: string,
  ): Promise<Uint8Array> {
    const audioStream = await this.client.textToSpeech.convert(voiceId, {
      text,
      modelId: this.config.ttsModel,
      outputFormat: "mp3_44100_128",
    });
    const response = new Response(audioStream);
    return new Uint8Array(await response.arrayBuffer());
  }

  private async generateImage(prompt: string): Promise<Uint8Array> {
    const generation = await this.client.flows.image.create({
      modelId: IMAGE_MODEL,
      prompt,
      aspectRatio: "16:9",
      resolution: "2K",
    });

    // Poll until complete.
    let result = await this.client.flows.image.get(generation.id);
    for (let i = 0; i < MAX_POLL_ATTEMPTS_IMAGE; i++) {
      if (result.status === "completed") break;
      if (result.status === "failed") {
        throw new Error(
          `Image generation failed: ${result.failureReason ?? "unknown"}`,
        );
      }
      await delay(IMAGE_POLL_INTERVAL_MS);
      result = await this.client.flows.image.get(generation.id);
    }

    if (result.status !== "completed" || !result.contentUrl) {
      throw new Error("Image generation timed out");
    }

    const imageResponse = await fetch(result.contentUrl);
    return new Uint8Array(await imageResponse.arrayBuffer());
  }

  private async generateVideo(
    prompt: string,
    durationSec: number,
  ): Promise<Uint8Array> {
    // Veo supports 4s, 6s, 8s durations. Pick the closest.
    const allowedDurations = [4, 6, 8];
    const videoDuration = allowedDurations.reduce((closest, d) =>
      Math.abs(d - durationSec) < Math.abs(closest - durationSec) ? d : closest,
    );

    const generation = await this.client.flows.video.create({
      modelId: VIDEO_MODEL,
      prompt,
      durationSecs: videoDuration,
      aspectRatio: "16:9",
      resolution: "1080p",
      generateAudio: true,
    });

    // Poll until complete.
    let result = await this.client.flows.video.get(generation.id);
    for (let i = 0; i < MAX_POLL_ATTEMPTS_VIDEO; i++) {
      if (result.status === "completed") break;
      if (result.status === "failed") {
        throw new Error(
          `Video generation failed: ${result.failureReason ?? "unknown"}`,
        );
      }
      await delay(VIDEO_POLL_INTERVAL_MS);
      result = await this.client.flows.video.get(generation.id);
    }

    if (result.status !== "completed" || !result.contentUrl) {
      throw new Error("Video generation timed out");
    }

    const videoResponse = await fetch(result.contentUrl);
    return new Uint8Array(await videoResponse.arrayBuffer());
  }
}

// --- Helpers ---

function assetUrl(base: string, key: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${b}/assets/${key}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateDurationSec(transcript: string): number {
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(4, Math.ceil(wordCount / WORDS_PER_SECOND));
}

/**
 * Summary for the Continuum continuity input. Includes the creative format
 * tone so the next segment's context reflects the style that was used.
 */
function summaryFor(
  request: GenerationRequest,
  format: CreativeFormat,
): string {
  const context = request.previousSummaries.at(-1);
  const brief = request.brief.trim();
  const tone = format.tone;
  return context
    ? `[${tone}] Continuation after "${context}": ${brief}`
    : `[${tone}] Introduction: ${brief}`;
}

function imagePromptFor(
  request: GenerationRequest,
  transcript: string,
  format: CreativeFormat,
): string {
  const brand = request.brandId ?? "a startup";
  const brief = request.brief.trim();
  return (
    `A striking advertisement image for ${brand}. ${brief}. ` +
    `Visual style: ${format.imageStyle}. ` +
    `The mood is ${format.tone} and matches this voiceover: "${transcript.slice(0, 100)}...". ` +
    `16:9 aspect ratio, high quality, attention-grabbing composition.`
  );
}

function videoPromptFor(
  request: GenerationRequest,
  transcript: string,
  format: CreativeFormat,
): string {
  const brand = request.brandId ?? "a startup";
  const brief = request.brief.trim();
  return (
    `A dynamic 4-to-8-second motion-design advertisement for ${brand}. ${brief}. ` +
    `Visual style: ${format.imageStyle}. The tone is ${format.tone}. ` +
    `Match Slopstream's live UI world: midnight-blue liquid data, electric violet and cyan ` +
    `particles, glowing auction bids, a threshold basin filling with verified attention, ` +
    `a brief QR-code pulse, then a clean proof signal resolving into a confident brand lockup. ` +
    `Use a fast but readable camera push, fluid transitions, crisp high-contrast lighting, ` +
    `and intentional visual hierarchy. No readable generated text, no fake logos, no clutter. ` +
    `Voiceover context: "${transcript.slice(0, 150)}..."`
  );
}
