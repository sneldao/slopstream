import { describe, expect, it, vi } from "vitest";

import {
  generateAudio,
  type AudioCommandDependencies,
} from "./audioCommand.js";

const SHA256 =
  "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";
const OBJECT_KEY = `audio/${SHA256}.mp3`;
const ASSET_URL = `https://assets.example.test/slopstream/${OBJECT_KEY}`;
const request = {
  segmentId: "segment:audio one",
  brandId: "brand:one",
  brief: "Keep your data safe with friendly backups.",
  tier: "audio",
  previousSummaries: ["The listener heard a calm introduction."],
};

const environment = {
  SLOPSTREAM_GENERATION_REQUEST: JSON.stringify(request),
  ELEVENLABS_VOICE_ID: "voice-test",
};

function dependencies(): AudioCommandDependencies {
  return {
    synthesizer: {
      synthesize: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    },
    publisher: {
      publish: vi.fn().mockResolvedValue({
        url: ASSET_URL,
        sha256: SHA256,
        objectKey: OBJECT_KEY,
        contentType: "audio/mpeg" as const,
      }),
    },
  };
}

describe("audio generation command", () => {
  it("synthesizes and durably uploads audio before returning the shared result", async () => {
    const providers = dependencies();

    const result = await generateAudio(environment, providers);

    expect(providers.synthesizer.synthesize).toHaveBeenCalledWith(
      request.brief,
    );
    expect(providers.publisher.publish).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      "audio/mpeg",
    );
    expect(result).toEqual({
      segmentId: request.segmentId,
      assetUrl: ASSET_URL,
      media: {
        version: 1,
        durationSec: 3,
        audio: {
          url: ASSET_URL,
          contentType: "audio/mpeg",
          sha256: SHA256,
        },
      },
      durationSec: 3,
      transcript: request.brief,
      summary: `Audio continuation after "${request.previousSummaries[0]}": ${request.brief}`,
      audioMetadata: {
        contentType: "audio/mpeg",
        durationEstimated: true,
        objectKey: OBJECT_KEY,
        provider: "elevenlabs",
        voiceId: "voice-test",
      },
    });
  });

  it("rejects non-audio tiers before calling external providers", async () => {
    const providers = dependencies();

    await expect(
      generateAudio(
        {
          ...environment,
          SLOPSTREAM_GENERATION_REQUEST: JSON.stringify({
            ...request,
            tier: "video",
          }),
        },
        providers,
      ),
    ).rejects.toThrow("audio command only supports tier=audio");
    expect(providers.synthesizer.synthesize).not.toHaveBeenCalled();
    expect(providers.publisher.publish).not.toHaveBeenCalled();
  });

  it("rejects an invalid durable URL returned by the upload boundary", async () => {
    const providers = dependencies();
    providers.publisher.publish = vi.fn().mockResolvedValue({
      url: "not a URL",
      sha256: SHA256,
      objectKey: OBJECT_KEY,
      contentType: "audio/mpeg",
    });

    await expect(generateAudio(environment, providers)).rejects.toThrow(
      "asset uploader returned an invalid asset URL",
    );
  });

  it("does not upload a result when synthesis fails", async () => {
    const providers = dependencies();
    providers.synthesizer.synthesize = vi
      .fn()
      .mockRejectedValue(new Error("ElevenLabs unavailable"));

    await expect(generateAudio(environment, providers)).rejects.toThrow(
      "ElevenLabs unavailable",
    );
    expect(providers.publisher.publish).not.toHaveBeenCalled();
  });
});
