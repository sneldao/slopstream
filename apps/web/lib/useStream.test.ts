import { describe, expect, it } from "vitest";
import { connectionLabel } from "@/lib/useStream";

describe("connectionLabel", () => {
  it("calls an open socket Live", () => {
    expect(connectionLabel("connected", true)).toBe("Live");
  });

  it("calls an in-flight first attempt Connecting", () => {
    expect(connectionLabel("connecting", false)).toBe("Connecting");
    expect(connectionLabel("idle", false)).toBe("Connecting");
  });

  it("calls a dropped socket Reconnecting", () => {
    expect(connectionLabel("offline", true)).toBe("Reconnecting");
  });

  // The bug this pins: a client that never opened a socket and keeps failing
  // used to read "Connecting" forever, which is a claim, not a diagnosis.
  it("calls a cold failure No signal", () => {
    expect(connectionLabel("offline", false)).toBe("No signal");
  });
});
