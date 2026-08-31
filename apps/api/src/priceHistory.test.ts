import { describe, expect, it } from "vitest";
import { priceHistoryCsv, priceHistoryFromSegments } from "./priceHistory.js";

const segments = [
  {
    id: "seg_2",
    slot: 2,
    brandId: "brand_b",
    durationSeconds: 30,
    summary: "",
    status: "done" as const,
    clearedAmountUsd: 18,
    windowOpenedAtMs: Date.parse("2026-08-31T12:00:00.000Z"),
    clearedAtMs: Date.parse("2026-08-31T12:03:00.000Z"),
  },
  {
    id: "seg_1",
    slot: 1,
    brandId: "brand_a",
    durationSeconds: 30,
    summary: "",
    status: "done" as const,
    clearedAmountUsd: 10,
    windowOpenedAtMs: Date.parse("2026-08-31T11:00:00.000Z"),
    clearedAtMs: Date.parse("2026-08-31T11:45:00.000Z"),
  },
  {
    id: "free_1",
    slot: 3,
    brandId: null,
    durationSeconds: 30,
    summary: "",
    status: "done" as const,
  },
];

describe("price history", () => {
  it("returns only cleared segments with the actual settlement timestamp", () => {
    expect(priceHistoryFromSegments(segments, { limit: 1 })).toEqual([
      {
        segmentId: "seg_2",
        slot: 2,
        amountUsd: 18,
        clearedAt: "2026-08-31T12:03:00.000Z",
      },
    ]);
  });

  it("filters points by their clearing time rather than playback start", () => {
    expect(
      priceHistoryFromSegments(segments, {
        since: Date.parse("2026-08-31T11:30:00.000Z"),
      }).map((point) => point.segmentId),
    ).toEqual(["seg_2", "seg_1"]);
  });

  it("serializes safe CSV with a header", () => {
    expect(
      priceHistoryCsv([
        {
          segmentId: "seg,2",
          slot: 2,
          amountUsd: 18,
          clearedAt: "2026-08-31T12:00:00.000Z",
        },
      ]),
    ).toBe(
      'segmentId,slot,amountUsd,clearedAt\n"seg,2",2,18,2026-08-31T12:00:00.000Z\n',
    );
  });
});
