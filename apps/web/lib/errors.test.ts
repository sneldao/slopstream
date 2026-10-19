import { describe, expect, it } from "vitest";

import { errorMessage } from "./errors.js";

describe("errorMessage", () => {
  it.each([
    "Failed to fetch",
    "Load failed",
    "NetworkError when attempting to fetch resource.",
    "  failed to fetch  ",
    "net::ERR_CONNECTION_REFUSED",
  ])("replaces the browser network error %s with the caller's copy", (raw) => {
    expect(errorMessage(new Error(raw), "Unable to place bid.")).toBe(
      "Unable to place bid.",
    );
  });

  it("keeps a server-authored message", () => {
    expect(
      errorMessage(new Error("Insufficient balance for this slot."), "oops"),
    ).toBe("Insufficient balance for this slot.");
  });

  it("falls back for non-Error throwables and empty messages", () => {
    expect(errorMessage("nope", "Unable to load balance.")).toBe(
      "Unable to load balance.",
    );
    expect(errorMessage(new Error(""), "Unable to load balance.")).toBe(
      "Unable to load balance.",
    );
  });
});
