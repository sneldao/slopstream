import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomeOverlay } from "./WelcomeOverlay";

describe("WelcomeOverlay", () => {
  it("brands the first touch with the Slopstream wordmark and value prop", () => {
    const html = renderToStaticMarkup(
      <WelcomeOverlay visible={true} onEnter={() => {}} />,
    );

    expect(html).toContain("Slopstream");
    expect(html).toContain("The live attention market");
    expect(html).toContain("Enter the stream");
    expect(html).toContain("Brands bid");
    expect(html).toContain("Everyone earns");
  });

  it("renders nothing when not visible", () => {
    const html = renderToStaticMarkup(
      <WelcomeOverlay visible={false} onEnter={() => {}} />,
    );

    expect(html).not.toContain("Slopstream");
    expect(html).not.toContain("Enter the stream");
  });
});
