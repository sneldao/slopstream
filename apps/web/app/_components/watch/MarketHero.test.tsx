import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarketHero } from "./MarketHero";

describe("MarketHero", () => {
  it("explains the next slot as a sponsored beat starting price", () => {
    const html = renderToStaticMarkup(
      <MarketHero
        leaderboard={[]}
        brandById={{}}
        nextSlotPriceUsd={25}
        recentSegments={[]}
      />,
    );

    expect(html).toContain("NEXT SPONSORED BEAT");
    expect(html).toContain("$25");
    expect(html).toContain("starts at");
    expect(html).toContain("starting price for the next sponsored beat");
  });
});
