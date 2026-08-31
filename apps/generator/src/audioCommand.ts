import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { GenerationRequest, GenerationResult } from "@slopstream/shared";
import { isPublicMediaUrl } from "@slopstream/shared";
import { pathToFileURL } from "node:url";

import { HttpAssetPublisher, type AssetPublisher } from "./assetPublisher.js";
import { parseGenerationRequest } from "./server.js";

const AUDIO_CONTENT_TYPE = "audio/mpeg";
const WORDS_PER_SECOND = 2.5;

type Environment = Readonly<Record<string, string | undefined>>;

export interface AudioSynthesizer {
  synthesize(transcript: string): Promise<Uint8Array>;
}

export interface AudioCommandDependencies {
  synthesizer: AudioSynthesizer;
  publisher: AssetPublisher;
}

export interface AudioCommandConfig {
  voiceId: string;
}

interface ProductionAudioCommandConfig extends AudioCommandConfig {
  assetUploadToken: string;
  assetUploadUrl: string;
  elevenLabsApiKey: string;
}

function requiredEnvironmentValue(
  environment: Environment,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for audio generation`);
  }
  return value;
}

function parseUrl(value: string, name: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

function parseRequest(environment: Environment): GenerationRequest {
  const rawRequest = requiredEnvironmentValue(
    environment,
    "SLOPSTREAM_GENERATION_REQUEST",
  );

  let value: unknown;
  try {
    value = JSON.parse(rawRequest);
  } catch {
    throw new Error("SLOPSTREAM_GENERATION_REQUEST must contain JSON");
  }

  const request = parseGenerationRequest(value);
  if (!request) {
    throw new Error(
      "SLOPSTREAM_GENERATION_REQUEST is not a valid GenerationRequest",
    );
  }
  if (request.tier !== "audio") {
    throw new Error(
      `audio command only supports tier=audio; received ${request.tier}`,
    );
  }
  return request;
}

function parseConfig(environment: Environment): AudioCommandConfig {
  return {
    voiceId: requiredEnvironmentValue(environment, "ELEVENLABS_VOICE_ID"),
  };
}

function parseProductionConfig(
  environment: Environment,
): ProductionAudioCommandConfig {
  const assetUploadUrl = requiredEnvironmentValue(
    environment,
    "ASSET_UPLOAD_URL",
  );
  parseUrl(assetUploadUrl, "ASSET_UPLOAD_URL");

  return {
    ...parseConfig(environment),
    assetUploadToken: requiredEnvironmentValue(
      environment,
      "ASSET_UPLOAD_TOKEN",
    ),
    assetUploadUrl,
    elevenLabsApiKey: requiredEnvironmentValue(
      environment,
      "ELEVENLABS_API_KEY",
    ),
  };
}

function transcriptFor(request: GenerationRequest): string {
  return request.brief.trim();
}

function summaryFor(request: GenerationRequest): string {
  const context = request.previousSummaries.at(-1);
  return context
    ? `Audio continuation after "${context}": ${request.brief.trim()}`
    : `Audio introduction: ${request.brief.trim()}`;
}

function estimateDurationSec(transcript: string): number {
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_SECOND));
}

/**
 * Generates an audio-only result and uploads the MP3 before returning its
 * durable URL. Diagnostics become errors so the executable can reserve stdout
 * for the sole JSON result consumed by DaytonaGenerationProvider.
 */
export async function generateAudio(
  environment: Environment,
  dependencies: AudioCommandDependencies,
): Promise<GenerationResult> {
  const request = parseRequest(environment);
  const config = parseConfig(environment);
  const transcript = transcriptFor(request);
  const audio = await dependencies.synthesizer.synthesize(transcript);
  if (audio.byteLength === 0) {
    throw new Error("ElevenLabs returned empty audio");
  }

  const published = await dependencies.publisher.publish(
    audio,
    AUDIO_CONTENT_TYPE,
  );
  if (!isPublicMediaUrl(published.url)) {
    throw new Error("asset uploader returned an invalid asset URL");
  }

  return {
    segmentId: request.segmentId,
    assetUrl: published.url,
    media: {
      version: 1,
      durationSec: estimateDurationSec(transcript),
      audio: {
        url: published.url,
        contentType: AUDIO_CONTENT_TYPE,
        sha256: published.sha256,
      },
    },
    durationSec: estimateDurationSec(transcript),
    transcript,
    summary: summaryFor(request),
    audioMetadata: {
      contentType: AUDIO_CONTENT_TYPE,
      durationEstimated: true,
      objectKey: published.objectKey,
      provider: "elevenlabs",
      voiceId: config.voiceId,
    },
  };
}

function createProductionDependencies(
  config: ProductionAudioCommandConfig,
): AudioCommandDependencies {
  const elevenLabs = new ElevenLabsClient({ apiKey: config.elevenLabsApiKey });

  return {
    synthesizer: {
      async synthesize(transcript) {
        const audioStream = await elevenLabs.textToSpeech.convert(
          config.voiceId,
          {
            text: transcript,
            modelId: "eleven_multilingual_v2",
            outputFormat: "mp3_44100_128",
          },
        );
        return new Uint8Array(await new Response(audioStream).arrayBuffer());
      },
    },
    publisher: new HttpAssetPublisher(
      config.assetUploadUrl,
      config.assetUploadToken,
    ),
  };
}

async function main(): Promise<void> {
  const config = parseProductionConfig(process.env);
  const result = await generateAudio(
    process.env,
    createProductionDependencies(config),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "audio generation failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
