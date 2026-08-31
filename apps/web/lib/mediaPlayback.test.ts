import { describe, expect, it } from "vitest";

import { playbackAudioUrl } from "./mediaPlayback.js";

describe("playbackAudioUrl", () => {
  it("prefers explicit manifest audio", () => {
    expect(
      playbackAudioUrl({
        assetUrl: "https://assets.test/legacy.mp3",
        media: {
          version: 1,
          durationSec: 10,
          audio: {
            url: "https://assets.test/manifest.mp3",
            contentType: "audio/mpeg",
            sha256: "a".repeat(64),
          },
        },
      }),
    ).toBe("https://assets.test/manifest.mp3");
  });

  it("accepts only a complete direct legacy MP3 URL", () => {
    expect(
      playbackAudioUrl({ assetUrl: "http://localhost:4300/assets/old.mp3" }),
    ).toBe("http://localhost:4300/assets/old.mp3");
    expect(
      playbackAudioUrl({ assetUrl: "https://assets.test/visual.mp4" }),
    ).toBeUndefined();
    expect(
      playbackAudioUrl({ assetUrl: "https://assets.test/old.mp3?token=no" }),
    ).toBeUndefined();
  });
});
