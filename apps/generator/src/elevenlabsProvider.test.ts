import { describe, expect, it } from "vitest";

import type { GenerationRequest } from "@slopstream/shared";

import { FORMATS } from "./creativeFormats.js";
import {
  createElevenLabsProviderFromEnv,
  imagePromptFor,
  videoPromptFor,
} from "./elevenlabsProvider.js";

const REQUEST: GenerationRequest = {
  segmentId: "seg_1",
  brandId: null,
  brief: "brief",
  tier: "video",
  previousSummaries: [],
};
const REQUEST_WITH_CONTINUITY: GenerationRequest = {
  ...REQUEST,
  continuityImageUrl: "http://localhost:4300/assets/prev.png",
};
const FORMAT = FORMATS[0];

describe("imagePromptFor", () => {
  it("prepends the reference-image clause only when grounded", () => {
    const grounded = imagePromptFor(
      "Acme",
      "Invoicing for freelancers.",
      "Acme. Invoicing.",
      FORMAT,
      REQUEST,
      { grounded: true },
    );
    const plain = imagePromptFor(
      "Acme",
      "Invoicing for freelancers.",
      "Acme. Invoicing.",
      FORMAT,
      REQUEST,
    );
    expect(grounded).toContain("attached reference image");
    expect(plain).not.toContain("attached reference image");
  });

  it("adds continuity clause when hasContinuityImage is true", () => {
    const withContinuity = imagePromptFor(
      "Acme",
      "Invoicing.",
      "Acme.",
      FORMAT,
      REQUEST_WITH_CONTINUITY,
      { hasContinuityImage: true },
    );
    const without = imagePromptFor(
      "Acme",
      "Invoicing.",
      "Acme.",
      FORMAT,
      REQUEST_WITH_CONTINUITY,
    );
    expect(withContinuity).toContain("previous segment's palette");
    expect(without).not.toContain("previous segment's palette");
    // The localhost URL must NEVER appear in the prompt text.
    expect(withContinuity).not.toContain("localhost");
    expect(without).not.toContain("localhost");
  });
});

describe("videoPromptFor", () => {
  it("uses the start-frame clause and never embeds a localhost URL", () => {
    const withFrame = videoPromptFor(
      "Acme",
      "Invoicing for freelancers.",
      "Acme. Invoicing.",
      FORMAT,
      REQUEST,
      { hasStartFrame: true },
    );
    expect(withFrame).toContain("Animate forward from the provided hero frame");
    expect(withFrame).not.toContain("localhost");
    const withoutFrame = videoPromptFor(
      "Acme",
      "Invoicing for freelancers.",
      "Acme. Invoicing.",
      FORMAT,
      REQUEST,
    );
    expect(withoutFrame).not.toContain("Animate forward");
  });

  it("adds continuity clause when hasContinuityImage and never leaks URL", () => {
    const withContinuity = videoPromptFor(
      "Acme",
      "Invoicing.",
      "Acme.",
      FORMAT,
      REQUEST_WITH_CONTINUITY,
      { hasContinuityImage: true },
    );
    const without = videoPromptFor(
      "Acme",
      "Invoicing.",
      "Acme.",
      FORMAT,
      REQUEST_WITH_CONTINUITY,
    );
    expect(withContinuity).toContain("previous segment's palette");
    expect(withContinuity).not.toContain("localhost");
    expect(without).not.toContain("previous segment's palette");
    expect(without).not.toContain("localhost");
  });
});

describe("createElevenLabsProviderFromEnv", () => {
  const requiredEnvironment = {
    ELEVENLABS_API_KEY: "test-api-key",
    ELEVENLABS_VOICE_ID: "test-voice-id",
  };

  it.each([
    "http://localhost:4300",
    "https://localhost:4300",
    "https://127.0.0.1",
    "https://10.0.0.5",
    "https://192.168.1.10",
    "https://[::1]",
    "https://[::127.0.0.1]",
    "https://[fc00::1]",
    "https://assets.slopstream.local",
  ])("rejects a non-public asset origin: %s", (assetBaseUrl) => {
    expect(() =>
      createElevenLabsProviderFromEnv({
        ...requiredEnvironment,
        ASSET_BASE_URL: assetBaseUrl,
      }),
    ).toThrow("ASSET_BASE_URL must be a queryless public HTTPS URL");
  });

  it("accepts a queryless public HTTPS asset origin", () => {
    expect(() =>
      createElevenLabsProviderFromEnv({
        ...requiredEnvironment,
        ASSET_BASE_URL: "https://assets.example.com/slopstream",
      }),
    ).not.toThrow();
  });

  it("requires an upload token when a remote asset origin is configured", () => {
    expect(() =>
      createElevenLabsProviderFromEnv({
        ...requiredEnvironment,
        ASSET_BASE_URL: "https://assets.example.com/slopstream",
        ASSET_UPLOAD_URL: "https://asset-uploader.example.test",
      }),
    ).toThrow("ASSET_UPLOAD_TOKEN");
  });
});
