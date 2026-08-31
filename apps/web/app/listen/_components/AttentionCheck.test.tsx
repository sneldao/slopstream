import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicChallenge } from "@slopstream/shared";
import { AttentionCheck } from "./AttentionCheck";

const challenge: PublicChallenge = {
  id: "chal_1",
  type: "recall",
  question: "What did the voice just claim about the robot?",
  options: ["It quit", "It got hired", "It went to Mars", "It slept"],
  segmentId: "seg_1",
  validFrom: 0,
  validUntil: 8,
  difficulty: 2,
};

function render(
  brandColor = "#45a7ff",
  onExpired?: () => void,
  nowPlayingStartedAt?: string,
) {
  return renderToStaticMarkup(
    <AttentionCheck
      challenge={challenge}
      brandColor={brandColor}
      onAnswer={() => {}}
      onExpired={onExpired}
      nowPlayingStartedAt={nowPlayingStartedAt}
    />,
  );
}

describe("AttentionCheck", () => {
  it("is a full-bleed overlay rather than a panel in the column", () => {
    const html = render();
    expect(html).toContain('class="attn"');
    expect(html).toContain('class="attn__veil"');
    expect(html).toContain('class="attn__clock"');
  });

  it("draws no container of its own — no radius, no border box, no shadow", () => {
    const html = render();
    expect(html).not.toContain("border-radius");
    expect(html).not.toContain("box-shadow");
    expect(html).not.toContain("backdrop-filter");
  });

  it("names the group after the question heading", () => {
    const html = render();
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-labelledby="attn-question"');
    expect(html).toContain('id="attn-question"');
    expect(html).toContain(challenge.question);
  });

  it("renders every answer as a real button inside a list", () => {
    const html = render();
    const buttons = html.match(/class="attn__option"/g) ?? [];
    expect(buttons).toHaveLength(challenge.options!.length);
    expect(html).toContain("<ul");
    for (const option of challenge.options!) expect(html).toContain(option);
  });

  it("keeps DOM order equal to reading order", () => {
    const html = render();
    const eyebrow = html.indexOf("Attention check");
    const question = html.indexOf(challenge.question);
    const firstAnswer = html.indexOf(challenge.options![0]);
    expect(eyebrow).toBeGreaterThan(-1);
    expect(eyebrow).toBeLessThan(question);
    expect(question).toBeLessThan(firstAnswer);
  });

  it("exposes the countdown as a labelled timer", () => {
    const html = render();
    expect(html).toContain('role="timer"');
    expect(html).toContain("seconds left to answer");
  });

  // Brands supply their own primaryColor. The answer rows put ink-coloured
  // text on the wash, so a dark brand colour would make the confirmed answer
  // unreadable. The wash must always come from the fixed palette; brand
  // colour is confined to the veil tint and the eyebrow dot.
  it("never washes an answer row in the brand colour", () => {
    const html = render("#101014");
    const optionMarkup = html.slice(html.indexOf('class="attn__option"'));
    expect(optionMarkup).not.toContain("#101014");
    expect(optionMarkup).toContain("--wash");
  });

  it("offers a continue action when expiry recovery is enabled", () => {
    const html = render(
      "#45a7ff",
      () => {},
      new Date(Date.now() - 9_000).toISOString(),
    );
    expect(html).toContain("Time");
    expect(html).toContain("Continue");
    expect(html).toContain('class="attn__continue"');
  });
});
