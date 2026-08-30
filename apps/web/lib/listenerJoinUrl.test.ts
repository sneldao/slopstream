import { describe, expect, it } from "vitest";
import { listenerJoinUrl } from "./listenerJoinUrl";

describe("listenerJoinUrl", () => {
  it("appends earn=1 to the configured listener URL", () => {
    const url = listenerJoinUrl("https://slopstream.example");
    expect(url).toContain("earn=1");
    expect(url).toMatch(/\/listen/);
  });
});
