import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EarnCta } from "./EarnCta";

describe("EarnCta", () => {
  it("makes the listener action explicit while the stream is playing", () => {
    const html = renderToStaticMarkup(
      <EarnCta listenerUrl="https://example.test/listen" idleRecruit={false} />,
    );

    expect(html).toContain("WATCH + EARN");
    expect(html).toContain("Scan to join");
    expect(html).toContain("Turn on Earn Mode");
  });

  it("promotes an available earn check without using market jargon", () => {
    const html = renderToStaticMarkup(
      <EarnCta
        listenerUrl="https://example.test/listen"
        idleRecruit={false}
        activeChallenge
      />,
    );

    expect(html).toContain("EARN CHECK AVAILABLE");
    expect(html).toContain("answer the check");
    expect(html).not.toContain("PROOF OPEN");
  });
});
