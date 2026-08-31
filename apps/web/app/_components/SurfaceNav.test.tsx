import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SurfaceNav } from "./SurfaceNav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("SurfaceNav", () => {
  it("names the three product roles in the shared navigation", () => {
    const html = renderToStaticMarkup(<SurfaceNav showDock={false} />);

    expect(html).toContain("Watch");
    expect(html).toContain("Earn");
    expect(html).toContain("Sponsor");
    expect(html).not.toContain(">Listen<");
    expect(html).not.toContain(">Brand<");
  });

  it("labels the spectacle navigation as role selection", () => {
    const html = renderToStaticMarkup(
      <SurfaceNav variant="spectacle" showDock={false} />,
    );

    expect(html).toContain('aria-label="Choose a role"');
  });
});
