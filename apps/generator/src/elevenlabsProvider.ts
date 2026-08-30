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

export interface ElevenLabsProviderConfig {
  apiKey: string;
  voiceId: string;
  /** Base URL for serving assets (e.g. http://localhost:4300). */
  assetBaseUrl: string;
  /** Local directory to save generated assets. */
  assetsDir: string;
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
  };
  return new ElevenLabsGenerationProvider(config);
}

/**
 * Generates ad content using ElevenLabs APIs:
 *
 * - **Script**: A template-based ad script from the brand brief. Produces a
 *   compelling 15-30 second voiceover transcript.
 * - **Voice**: ElevenLabs TTS (`textToSpeech.convert`) with the
 *   `eleven_v3` model for expressive delivery.
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

    // Stage 1: Script — generate a compelling ad transcript from the brief.
    const transcript = scriptFor(request);

    // Stage 2: Voice — TTS via ElevenLabs.
    const audioBytes = await this.synthesizeVoice(transcript);
    const audioKey = `${request.segmentId}.mp3`;
    await writeFile(join(this.config.assetsDir, audioKey), audioBytes);

    const durationSec = estimateDurationSec(transcript);
    const summary = summaryFor(request);

    // For audio tier, the asset is the MP3 itself.
    if (request.tier === "audio") {
      return {
        segmentId: request.segmentId,
        assetUrl: assetUrl(this.config.assetBaseUrl, audioKey),
        durationSec,
        transcript,
        summary,
        audioMetadata: {
          provider: "elevenlabs",
          voiceId: this.config.voiceId,
          modelId: "eleven_v3",
          format: "mp3_44100_128",
        },
      };
    }

    // Stage 3: Image — generate a visual for audio_image and above.
    if (request.tier === "audio_image") {
      const imagePrompt = imagePromptFor(request, transcript);
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
          voiceId: this.config.voiceId,
          modelId: "eleven_v3",
          format: "mp3_44100_128",
          file: audioKey,
        },
      };
    }

    // Stage 4: Video — generate a video for video and premium tiers.
    const videoPrompt = videoPromptFor(request, transcript);
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
        voiceId: this.config.voiceId,
        modelId: "eleven_v3",
        format: "mp3_44100_128",
        file: audioKey,
      },
    };
  }

  // --- ElevenLabs API calls ---

  private async synthesizeVoice(text: string): Promise<Uint8Array> {
    const audioStream = await this.client.textToSpeech.convert(
      this.config.voiceId,
      {
        text,
        modelId: "eleven_v3",
        outputFormat: "mp3_44100_128",
      },
    );
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
 * Template-based ad script generator. Produces a compelling 15-30 second
 * voiceover from the brand brief, incorporating Continuum continuity.
 *
 * This avoids requiring a separate LLM API key for the hackathon. The
 * templates produce natural-sounding ad copy that works well with ElevenLabs
 * expressive TTS.
 */
function scriptFor(request: GenerationRequest): string {
  const brand = request.brandId ?? "this company";
  const brief = request.brief.trim();
  const context = request.previousSummaries.at(-1);

  // The script follows a proven ad structure: hook → problem → solution → cta.
  const hook = context
    ? `Last time, ${context}. Now, ${brand} is back with something even bigger.`
    : `Hey. Stop scrolling. ${brand} is about to change how you work.`;

  const body =
    brief.length > 120
      ? brief
      : `${brief} It's fast, it's smart, and it's built for people who move first.`;

  const cta = `Don't get left behind. ${brand} — the future, live right now.`;

  return `${hook} ${body} ${cta}`;
}

function summaryFor(request: GenerationRequest): string {
  const context = request.previousSummaries.at(-1);
  return context
    ? `Continuation after "${context}": ${request.brief.trim()}`
    : `Introduction: ${request.brief.trim()}`;
}

function imagePromptFor(
  request: GenerationRequest,
  transcript: string,
): string {
  const brand = request.brandId ?? "a startup";
  const brief = request.brief.trim();
  return (
    `A striking, cinematic advertisement image for ${brand}. ${brief}. ` +
    `The image should feel premium, modern, and attention-grabbing. ` +
    `16:9 aspect ratio, photorealistic style with dramatic lighting. ` +
    `The mood matches this voiceover: "${transcript.slice(0, 100)}..."`
  );
}

function videoPromptFor(
  request: GenerationRequest,
  transcript: string,
): string {
  const brand = request.brandId ?? "a startup";
  const brief = request.brief.trim();
  return (
    `A cinematic 8-second advertisement video for ${brand}. ${brief}. ` +
    `Dynamic camera movement, professional lighting, modern aesthetic. ` +
    `The video should feel like a premium tech ad — fast cuts, ` +
    `dramatic reveals, and a clear call to action. ` +
    `Voiceover context: "${transcript.slice(0, 150)}..."`
  );
}
