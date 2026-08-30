import { describe, expect, it } from "vitest";
import { continuumAssetType, selectSceneRecipe } from "./continuumScene";

describe("Continuum scene recipes", () => {
  it("gives video a cinema composition", () => {
    expect(
      selectSceneRecipe({
        segmentId: "seg_video",
        assetUrl: "https://cdn.test/ad.mp4?version=2",
      }),
    ).toBe("cinema");
  });

  it("selects stable recipes for generated and archived content", () => {
    const input = { segmentId: "seg_image_42", assetUrl: "/asset.webp" };
    const first = selectSceneRecipe(input);
    expect(selectSceneRecipe(input)).toBe(first);
    expect(["editorial", "orbit", "cascade", "constellation"]).toContain(first);
  });

  it("detects media types without being confused by URL parameters", () => {
    expect(continuumAssetType("/image.avif?width=1200")).toBe("image");
    expect(continuumAssetType("/voice.mp3")).toBe("audio");
  });
});
