import { describe, expect, it } from "vitest";

import { parseGenerationRequest } from "./server.js";

const VALID = {
  segmentId: "seg_1",
  brandId: null,
  brief: "Write a short ad for Acme.",
  tier: "video",
  previousSummaries: [],
};

describe("parseGenerationRequest", () => {
  it("parses a minimal valid request", () => {
    expect(parseGenerationRequest(VALID)).toEqual(VALID);
  });

  it("keeps a valid sourceUrl", () => {
    expect(
      parseGenerationRequest({ ...VALID, sourceUrl: "https://acme.example" }),
    ).toEqual({ ...VALID, sourceUrl: "https://acme.example" });
  });

  it("silently drops a non-http sourceUrl without rejecting the request", () => {
    expect(
      parseGenerationRequest({ ...VALID, sourceUrl: "javascript:alert(1)" }),
    ).toEqual(VALID);
  });

  it("silently drops an overlong sourceUrl", () => {
    const sourceUrl = `https://acme.example/${"x".repeat(3000)}`;
    expect(parseGenerationRequest({ ...VALID, sourceUrl })).toEqual(VALID);
  });

  it("rejects missing brief or bad tier", () => {
    expect(parseGenerationRequest({ ...VALID, brief: "" })).toBeUndefined();
    expect(
      parseGenerationRequest({ ...VALID, tier: "hologram" }),
    ).toBeUndefined();
  });

  it("rejects non-records", () => {
    expect(parseGenerationRequest(null)).toBeUndefined();
    expect(parseGenerationRequest("nope")).toBeUndefined();
  });
});
