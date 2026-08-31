import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createHash } from "node:crypto";
import type { GenerationRequest, GenerationResult } from "@slopstream/shared";
import { pathToFileURL } from "node:url";

import { parseGenerationRequest } from "./server.js";

const AUDIO_CONTENT_TYPE = "audio/mpeg";
const WORDS_PER_SECOND = 2.5;

type Environment = Readonly<Record<string, string | undefined>>;

export interface AudioSynthesizer {
  synthesize(transcript: string): Promise<Uint8Array>;
}

export interface AssetUploader {
  upload(objectKey: string, body: Uint8Array, sha256: string): Promise<string>;
}

export interface AudioCommandDependencies {
  synthesizer: AudioSynthesizer;
  uploader: AssetUploader;
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

function objectKeyFor(sha256: string): string {
  return `audio/${sha256}.mp3`;
}

function estimateDurationSec(transcript: string): number {
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_SECOND));
}

function isAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
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

  const sha256 = createHash("sha256").update(audio).digest("hex");
  const objectKey = objectKeyFor(sha256);
  const assetUrl = await dependencies.uploader.upload(objectKey, audio, sha256);
  if (!isAbsoluteUrl(assetUrl)) {
    throw new Error("asset uploader returned an invalid asset URL");
  }

  return {
    segmentId: request.segmentId,
    assetUrl,
    media: {
      version: 1,
      durationSec: estimateDurationSec(transcript),
      audio: {
        url: assetUrl,
        contentType: AUDIO_CONTENT_TYPE,
        sha256,
      },
    },
    durationSec: estimateDurationSec(transcript),
    transcript,
    summary: summaryFor(request),
    audioMetadata: {
      contentType: AUDIO_CONTENT_TYPE,
      durationEstimated: true,
      objectKey,
      provider: "elevenlabs",
      voiceId: config.voiceId,
    },
  };
}

function uploadUrlFor(assetUploadUrl: string, objectKey: string): string {
  const base = assetUploadUrl.endsWith("/")
    ? assetUploadUrl
    : `${assetUploadUrl}/`;
  return new URL(`v1/assets/${objectKey}`, base).toString();
}

function assetUrlFromResponse(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const assetUrl = (value as Record<string, unknown>).assetUrl;
  return typeof assetUrl === "string" && assetUrl.trim() ? assetUrl : undefined;
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
    uploader: {
      async upload(objectKey, body, sha256) {
        const response = await fetch(
          uploadUrlFor(config.assetUploadUrl, objectKey),
          {
            method: "PUT",
            headers: {
              authorization: `Bearer ${config.assetUploadToken}`,
              "content-type": AUDIO_CONTENT_TYPE,
              "x-content-sha256": sha256,
            },
            body: new Uint8Array(body),
          },
        );
        if (!response.ok) {
          throw new Error(`asset upload failed with status ${response.status}`);
        }

        const assetUrl = assetUrlFromResponse(await response.json());
        if (assetUrl === undefined) {
          throw new Error("asset upload response did not include an asset URL");
        }
        return assetUrl;
      },
    },
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
