import { isMediaManifest } from "@slopstream/shared";
import { describe, expect, it } from "vitest";

const validManifest = {
  version: 1,
  durationSec: 30,
  audio: {
    url: "https://cdn.test/media/segment.mp3",
    contentType: "audio/mpeg",
    sha256: "a".repeat(64),
  },
  visual: {
    url: "https://cdn.test/media/segment.mp4",
    contentType: "video/mp4",
    sha256: "b".repeat(64),
    type: "video",
    posterUrl: "https://cdn.test/media/segment.png",
  },
} as const;

describe("media manifest trust boundary", () => {
  it("accepts an immutable public audio and video manifest", () => {
    expect(isMediaManifest(validManifest)).toBe(true);
  });

  it.each([
    [
      "non-HTTPS asset URL",
      {
        ...validManifest,
        audio: {
          ...validManifest.audio,
          url: "http://cdn.test/media/segment.mp3",
        },
      },
    ],
    [
      "query-bearing asset URL",
      {
        ...validManifest,
        audio: {
          ...validManifest.audio,
          url: "https://cdn.test/media/segment.mp3?token=secret",
        },
      },
    ],
    [
      "non-public HTTPS asset URL",
      {
        ...validManifest,
        audio: {
          ...validManifest.audio,
          url: "https://127.0.0.1/media/segment.mp3",
        },
      },
    ],
    [
      "local HTTPS asset URL",
      {
        ...validManifest,
        audio: {
          ...validManifest.audio,
          url: "https://assets.slopstream.local/media/segment.mp3",
        },
      },
    ],
    [
      "private IPv6 asset URL",
      {
        ...validManifest,
        audio: {
          ...validManifest.audio,
          url: "https://[fc00::1]/media/segment.mp3",
        },
      },
    ],
    [
      "IPv4-compatible IPv6 loopback asset URL",
      {
        ...validManifest,
        audio: {
          ...validManifest.audio,
          url: "https://[::127.0.0.1]/media/segment.mp3",
        },
      },
    ],
    [
      "non-HTTP asset URL",
      {
        ...validManifest,
        audio: { ...validManifest.audio, url: "javascript:alert(1)" },
      },
    ],
    [
      "credential-bearing asset URL",
      {
        ...validManifest,
        audio: {
          ...validManifest.audio,
          url: "https://token@cdn.test/media/segment.mp3",
        },
      },
    ],
    [
      "fragment-bearing caption URL",
      {
        ...validManifest,
        captionsUrl: "https://cdn.test/media/captions.vtt#private",
      },
    ],
    [
      "wrong media MIME type",
      {
        ...validManifest,
        visual: { ...validManifest.visual, contentType: "image/png" },
      },
    ],
    [
      "invalid byte checksum",
      {
        ...validManifest,
        audio: { ...validManifest.audio, sha256: "A".repeat(64) },
      },
    ],
  ])("rejects a %s", (_reason, candidate) => {
    expect(isMediaManifest(candidate)).toBe(false);
  });
});
