import { describe, expect, it } from "vitest";
import { ClearingEngine } from "./clearing.js";
import { composeSnapshot } from "./snapshot.js";
import { setupHarness } from "./test-harness.js";
import { StubProofVerifier } from "./verifier.js";

describe("composeSnapshot", () => {
  it("returns completed segments newest first and excludes failed work", () => {
    const harness = setupHarness();
    const clearing = new ClearingEngine(
      harness.ledger,
      harness.bus,
      new StubProofVerifier(),
      { listenerPct: 0.8, platformPct: 0.2 },
    );
    const segment = (id: string, openedAt: number, status: "done" | "failed") =>
      ({
        id,
        slot: openedAt,
        brandId: null,
        bidId: null,
        status,
        durationSec: 20,
        mediaUrl: `/assets/${id}.webp`,
        summary: `${id} summary`,
        thresholdFraction: 0.6,
        windowOpenedAtMs: openedAt,
        windowClosed: true,
      }) as const;

    harness.ledger.segments.set("older", segment("older", 100, "done"));
    harness.ledger.segments.set("newer", segment("newer", 200, "done"));
    harness.ledger.segments.set("failed", segment("failed", 300, "failed"));

    const snapshot = composeSnapshot(
      harness.ledger,
      harness.bus,
      harness.auction,
      clearing,
    );

    expect(snapshot.recentSegments.map((item) => item.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(snapshot.recentSegments[0]?.assetUrl).toBe("/assets/newer.webp");
  });
});
