import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FREE_BRAND_ID,
  type GenerationRequest,
  type GenerationResult,
  type ProductionTier,
} from "@slopstream/shared";

import type { GenerationProvider } from "./generator.js";
import {
  marketSting,
  MAX_SCRIPT_WORDS,
  normalizeAdBrief,
  pickFormat,
  truncateWords,
  voiceForFormat,
  type CreativeFormat,
} from "./creativeFormats.js";
import {
  DEFAULT_LLM_TIMEOUT_MS,
  generateCreative,
  parseLlmEndpoints,
  type LlmEndpoint,
} from "./llm.js";
import { fetchOgImage, fetchContinuityImage, type OgImage } from "./ogImage.js";

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
/** Inline image references cap at 25 MB decoded; keep a safety margin. */
const MAX_START_FRAME_BYTES = 18_000_000;

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
  /** Free-LLM creative chain; undefined = template scripts only. */
  llmEndpoints?: LlmEndpoint[];
  /** Per-endpoint timeout for the LLM chain. */
  llmTimeoutMs: number;
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

function parseLlmTimeoutMs(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_LLM_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`LLM_TIMEOUT_MS=${value} must be a positive number`);
  }
  return parsed;
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
    llmEndpoints: parseLlmEndpoints(
      optionalEnvironmentValue(environment, "LLM_ENDPOINTS"),
    ),
    llmTimeoutMs: parseLlmTimeoutMs(
      optionalEnvironmentValue(environment, "LLM_TIMEOUT_MS"),
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

    // Normalize the brief: free-segment briefs are LLM instructions
    // ("Write a short ad for {company}..."), not spoken copy. Extract the
    // clean subject and description so the VO and image prompt reference the
    // actual product, not the instruction text.
    const { subject, description: briefDescription } = normalizeAdBrief(
      request.brief,
      request.brandId,
    );

    // Stage 1: Script — the LLM creative chain (when configured) summarizes
    // messy scraped copy and writes the voiceover; any failure degrades to
    // the format template so generation never stalls on an LLM error.
    const isFree =
      request.brandId === null || request.brandId === FREE_BRAND_ID;
    let description = briefDescription;
    let transcript: string | undefined;
    let scriptSource: "llm" | "template" = "template";
    let llmModel: string | undefined;
    if (this.config.llmEndpoints) {
      const sting = marketSting(request.marketContext);
      const creative = await generateCreative(
        this.config.llmEndpoints,
        {
          subject,
          description: briefDescription,
          formatName: format.name,
          tone: format.tone,
          ...(sting ? { marketSting: sting } : {}),
          needsDescription: isFree,
        },
        { timeoutMs: this.config.llmTimeoutMs },
      );
      const cleaned = creative ? sanitizeScript(creative.script) : "";
      if (creative && cleaned) {
        transcript = cleaned;
        scriptSource = "llm";
        llmModel = creative.model;
        if (isFree && creative.productDescription) {
          description = creative.productDescription;
        }
      }
    }
    if (!transcript) {
      transcript = format.script({
        brand: subject,
        brief: description,
        context: request.previousSummaries.at(-1),
        market: request.marketContext,
      });
    }
    const scriptTelemetry = {
      scriptSource,
      ...(llmModel ? { llmModel } : {}),
    };
    console.log(
      `[generator] ${request.segmentId} script via ${scriptSource}` +
        (llmModel ? ` (${llmModel})` : ""),
    );

    // Stage 2: Voice — TTS via ElevenLabs with the format's voice.
    const audioBytes = await this.synthesizeVoice(transcript, voiceId);
    const audioKey = `${request.segmentId}.mp3`;
    await writeFile(join(this.config.assetsDir, audioKey), audioBytes);

    const durationSec = estimateDurationSec(transcript);
    const summary = summaryFor(subject, description, format);

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
          ...scriptTelemetry,
        },
      };
    }

    // Stage 3: Image — generate a visual for audio_image and above. Ground
    // it on the scraped company's real OG image when one can be fetched;
    // any fetch failure silently skips grounding.
    const referenceImage = request.sourceUrl
      ? await fetchOgImage(request.sourceUrl)
      : null;
    if (referenceImage) {
      console.log(`[generator] ${request.segmentId} grounded on OG image`);
    }

    // Continuity image — the previous segment's hero frame, fetched internally
    // so it can be passed as a reference image instead of a text-prompt URL.
    const continuityImage = request.continuityImageUrl
      ? await fetchContinuityImage(request.continuityImageUrl)
      : null;
    if (continuityImage) {
      console.log(
        `[generator] ${request.segmentId} continuity from previous hero frame`,
      );
    }
    // OG image takes priority (it's the real product photo); fall back to continuity.
    const effectiveReference = referenceImage ?? continuityImage;

    if (tier === "audio_image") {
      const imagePrompt = imagePromptFor(
        subject,
        description,
        transcript,
        format,
        request,
        {
          grounded: referenceImage !== null,
          hasContinuityImage: continuityImage !== null,
        },
      );
      const imageBytes = await this.generateImage(
        imagePrompt,
        effectiveReference,
      );
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
          heroImageUrl: assetUrl(this.config.assetBaseUrl, imageKey),
        },
        audioMetadata: {
          provider: "elevenlabs",
          voiceId,
          modelId: this.config.ttsModel,
          format: "mp3_44100_128",
          file: audioKey,
          creativeFormat: format.name,
          tone: format.tone,
          ...scriptTelemetry,
        },
      };
    }

    // Stage 4: Video — image-first continuity, then motion.
    const imagePrompt = imagePromptFor(
      subject,
      description,
      transcript,
      format,
      request,
      {
        grounded: referenceImage !== null,
        hasContinuityImage: continuityImage !== null,
      },
    );
    const imageBytes = await this.generateImage(
      imagePrompt,
      effectiveReference,
    );
    const imageKey = `${request.segmentId}.png`;
    await writeFile(join(this.config.assetsDir, imageKey), imageBytes);
    const heroImageUrl = assetUrl(this.config.assetBaseUrl, imageKey);

    // Feed the hero frame to Veo as an actual start frame — the old prompt
    // referenced a localhost URL the model could never fetch.
    const startFrame =
      imageBytes.byteLength <= MAX_START_FRAME_BYTES
        ? {
            type: "inline_base64" as const,
            contentBase64: Buffer.from(imageBytes).toString("base64"),
            mimeType: "image/png" as const,
          }
        : undefined;

    const videoPrompt = videoPromptFor(
      subject,
      description,
      transcript,
      format,
      request,
      {
        hasStartFrame: startFrame !== undefined,
        hasContinuityImage: continuityImage !== null,
      },
    );
    const videoBytes = await this.generateVideo(
      videoPrompt,
      durationSec,
      startFrame,
    );
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
        heroImageUrl,
        continuityFrom: request.continuityImageUrl,
      },
      audioMetadata: {
        provider: "elevenlabs",
        voiceId,
        modelId: this.config.ttsModel,
        format: "mp3_44100_128",
        file: audioKey,
        creativeFormat: format.name,
        tone: format.tone,
        ...scriptTelemetry,
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

  private async generateImage(
    prompt: string,
    referenceImage: OgImage | null,
  ): Promise<Uint8Array> {
    const generation = await this.client.flows.image.create({
      modelId: IMAGE_MODEL,
      prompt,
      aspectRatio: "16:9",
      resolution: "2K",
      ...(referenceImage
        ? {
            images: [
              {
                type: "inline_base64" as const,
                contentBase64: referenceImage.base64,
                mimeType: referenceImage.mimeType,
              },
            ],
          }
        : {}),
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
    startFrame?: {
      type: "inline_base64";
      contentBase64: string;
      mimeType: "image/png";
    },
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
      ...(startFrame ? { startFrame } : {}),
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

/** Strip stage directions from an LLM script and enforce the word budget. */
function sanitizeScript(script: string): string {
  return truncateWords(
    script
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    MAX_SCRIPT_WORDS,
  );
}

/**
 * Summary for the Continuum continuity input. Includes the creative format
 * tone so the next segment's context reflects the style that was used.
 * Uses the normalized subject (already extracted from the brief) so the
 * summary reads as content, not as an instruction.
 */
function summaryFor(
  subject: string,
  description: string,
  format: CreativeFormat,
): string {
  const core = subject || truncateWords(description, 12);
  return `${core} — ${format.tone}`;
}

export function imagePromptFor(
  subject: string,
  description: string,
  transcript: string,
  format: CreativeFormat,
  request: GenerationRequest,
  options: { grounded?: boolean; hasContinuityImage?: boolean } = {},
): string {
  const continuity = options.hasContinuityImage
    ? "Echo the previous segment's palette and composition from the attached reference frame. "
    : "";
  const market = marketPromptClause(request.marketContext);
  const grounding = options.grounded
    ? "Use the attached reference image of the real product as your visual anchor — keep the product instantly recognizable, then restyle it into the scene. "
    : "";
  return (
    `${grounding}Cinematic product-placement still for ${subject}. ${description}. ` +
    `Visual style: ${format.imageStyle}. ` +
    `Mood: ${format.tone}, matching this voiceover (do not render as text): "${transcript.slice(0, 100)}...". ` +
    `${continuity}${market}` +
    `Show the product, character, or world — not a poster. ` +
    `16:9, high quality, shallow depth of field. ` +
    `No readable text, no logos, no subtitles, no UI chrome, no watermarks.`
  );
}

export function videoPromptFor(
  subject: string,
  description: string,
  transcript: string,
  format: CreativeFormat,
  request: GenerationRequest,
  options: { hasStartFrame?: boolean; hasContinuityImage?: boolean } = {},
): string {
  const continuity = options.hasContinuityImage
    ? "Echo the previous segment's palette and composition from the attached reference frame. "
    : "";
  const market = marketPromptClause(request.marketContext);
  const heroClause = options.hasStartFrame
    ? "Animate forward from the provided hero frame; the first frame must match it. "
    : "";
  return (
    `A dynamic 4-to-8-second product-placement motion ad for ${subject}. ${description}. ` +
    `Visual style: ${format.imageStyle}. Tone: ${format.tone}. ` +
    `${heroClause}` +
    `${continuity}${market}` +
    `Camera: slow push or orbit, fluid transitions, cinematic lighting. ` +
    `The story is told by picture and motion — voiceover carries the words (do not show them). ` +
    `No readable text, no fake logos, no subtitles, no dashboards, no QR codes, no clutter. ` +
    `Voiceover context (audio only): "${transcript.slice(0, 150)}..."`
  );
}

function continuityClause(_continuityImageUrl?: string): string {
  return "";
}

function marketPromptClause(
  market: GenerationRequest["marketContext"],
): string {
  if (!market) return "";
  if (market.attentionProgress !== undefined && market.attentionProgress >= 1) {
    return "The crowd just proved attention — show triumphant, verified energy. ";
  }
  if (market.leaderAmountUsd !== undefined && market.leaderAmountUsd >= 30) {
    return "The auction floor is competitive — lean into urgency and heat. ";
  }
  return "";
}
