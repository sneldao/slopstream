import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

/**
 * The manifest is served from whatever host the visitor reaches, so a URL
 * baked from NEXT_PUBLIC_SITE_URL is foreign the moment that host differs —
 * Chrome then ignores start_url, narrows scope, and drops the shortcuts.
 */
describe("web app manifest", () => {
  const value = manifest();

  it("starts at the origin root, not at a configured host", () => {
    expect(value.start_url).toBe("/");
    expect(value.scope).toBe("/");
  });

  it("keeps every shortcut inside the manifest scope", () => {
    const shortcuts = value.shortcuts ?? [];
    expect(shortcuts.map((shortcut) => shortcut.url)).toEqual([
      "/",
      "/listen",
      "/brand",
    ]);
    for (const shortcut of shortcuts) {
      expect(shortcut.url).toMatch(/^\//);
    }
  });

  it("names icons by path so they resolve against the served origin", () => {
    for (const icon of value.icons ?? []) {
      expect(icon.src).not.toMatch(/^https?:/);
    }
  });
});
