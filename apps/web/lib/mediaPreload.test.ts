import { describe, expect, it } from "vitest";
import type { Segment } from "@slopstream/shared";

import { mediaPreloadPlans } from "./mediaPreload";

function segment(id: string, overrides: Partial<Segment> = {}): Segment {
  return {
    id,
    slot: 1,
    brandId: "brand_1",
    durationSeconds: 30,
    summary: "summary",
    status: "ready",
    media: {
      version: 1,
      durationSec: 30,
      audio: {
        url: `https://cdn.test/${id}.mp3`,
        contentType: "audio/mpeg",
        sha256: "a".repeat(63) + id.at(-1),
      },
      visual: {
        url: `https://cdn.test/${id}.mp4`,
        contentType: "video/mp4",
        sha256: "b".repeat(63) + id.at(-1),
        type: "video",
      },
    },
    ...overrides,
  };
}

describe("mediaPreloadPlans", () => {
  it("warms only the next manifest-declared audio and visual assets", () => {
    const plans = mediaPreloadPlans([
      segment("seg_1"),
      segment("seg_2"),
      segment("seg_3"),
    ]);

    expect(plans).toEqual([
      {
        key: `audio:${"a".repeat(63)}1`,
        kind: "audio",
        url: "https://cdn.test/seg_1.mp3",
      },
      {
        key: `video:${"b".repeat(63)}1`,
        kind: "video",
        url: "https://cdn.test/seg_1.mp4",
      },
      {
        key: `audio:${"a".repeat(63)}2`,
        kind: "audio",
        url: "https://cdn.test/seg_2.mp3",
      },
      {
        key: `video:${"b".repeat(63)}2`,
        kind: "video",
        url: "https://cdn.test/seg_2.mp4",
      },
    ]);
  });

  it("does not infer preload assets from a legacy URL", () => {
    expect(
      mediaPreloadPlans([
        segment("seg_legacy", {
          media: undefined,
          assetUrl: "https://cdn.test/legacy.mp4",
        }),
      ]),
    ).toEqual([]);
  });
});
