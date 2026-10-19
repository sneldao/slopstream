import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlaybackNotice } from "./PlaybackNotice";

const base = {
  muted: false,
  onRetry: () => {},
};

describe("PlaybackNotice", () => {
  it("speaks up when the audio stalls", () => {
    const html = renderToStaticMarkup(
      <PlaybackNotice {...base} playbackState="degraded" />,
    );

    expect(html).toContain("audio stalled");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Tap to restore sound");
  });

  it("stays out of the way while the listener has chosen silence", () => {
    const html = renderToStaticMarkup(
      <PlaybackNotice {...base} muted playbackState="degraded" />,
    );

    expect(html).toBe("");
  });

  it("treats a between-segments gap as normal, not a fault", () => {
    for (const playbackState of [
      "idle",
      "loading",
      "playing",
      "ended",
    ] as const) {
      expect(
        renderToStaticMarkup(
          <PlaybackNotice {...base} playbackState={playbackState} />,
        ),
      ).toBe("");
    }
  });
});
