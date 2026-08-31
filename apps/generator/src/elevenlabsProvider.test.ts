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
const FORMAT = FORMATS[0];

describe("imagePromptFor", () => {
  it("prepends the reference-image clause only when grounded", () => {
    const grounded = imagePromptFor(
      "Acme",
      "Invoicing for freelancers.",
      "Acme. Invoicing.",
      FORMAT,
      REQUEST,
      true,
    );
    const plain = imagePromptFor(
      "Acme",
      "Invoicing for freelancers.",
      "Acme. Invoicing.",
      FORMAT,
      REQUEST,
      false,
    );
    expect(grounded).toContain("attached reference image");
    expect(plain).not.toContain("attached reference image");
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
      true,
    );
    expect(withFrame).toContain("Animate forward from the provided hero frame");
    expect(withFrame).not.toContain("localhost");
    const withoutFrame = videoPromptFor(
      "Acme",
      "Invoicing for freelancers.",
      "Acme. Invoicing.",
      FORMAT,
      REQUEST,
      false,
    );
    expect(withoutFrame).not.toContain("Animate forward");
  });
});
