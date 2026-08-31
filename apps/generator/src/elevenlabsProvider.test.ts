import { describe, expect, it } from "vitest";

import type { GenerationRequest } from "@slopstream/shared";

import { FORMATS } from "./creativeFormats.js";
import { imagePromptFor, videoPromptFor } from "./elevenlabsProvider.js";

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
