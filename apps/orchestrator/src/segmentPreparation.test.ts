import type { AuctionState } from "@slopstream/shared";
import { describe, expect, it } from "vitest";

import { SegmentPreparationService } from "./segmentPreparation.js";

const winner: NonNullable<AuctionState["winner"]> = {
  bidId: "bid_one",
  brandId: "brand_one",
  amountUsd: 20,
  tier: "video",
  brief: "Tell a concise story about a trustworthy service.",
  segmentId: "segment_one",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("SegmentPreparationService", () => {
  it("moves a generated winner through Lane 2 ready and challenge-source", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const fetcher = (async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url.endsWith("/v1/generations")) {
        return response(
          {
            segmentId: winner.segmentId,
            assetUrl: "https://assets.example/segment_one.mp4",
            media: {
              version: 1,
              durationSec: 30,
              audio: {
                url: "https://assets.example/segment_one.mp3",
                contentType: "audio/mpeg",
                sha256: "a".repeat(64),
              },
              visual: {
                url: "https://assets.example/segment_one.mp4",
                contentType: "video/mp4",
                sha256: "b".repeat(64),
                type: "video",
                posterUrl: "https://assets.example/segment_one.png",
              },
            },
            durationSec: 30,
            transcript: "Trustworthy service, real value.",
            summary: "A concise trust story.",
            visualMetadata: { style: "clean" },
            audioMetadata: { voice: "warm" },
          },
          201,
        );
      }
      return response({ ok: true });
    }) as typeof fetch;

    const service = new SegmentPreparationService(
      "http://api.test/",
      "http://generator.test/",
      fetcher,
      20,
    );
    const result = await service.prepare(winner, ["Previous story."]);

    expect(result.segmentId).toBe(winner.segmentId);
    expect(calls.map((call) => call.url)).toEqual([
      "http://api.test/segments/segment_one/generating",
      "http://generator.test/v1/generations",
      "http://api.test/segments/segment_one/ready",
      "http://api.test/segments/segment_one/challenge-source",
    ]);
    expect(calls[1].body).toMatchObject({
      segmentId: winner.segmentId,
      previousSummaries: ["Previous story."],
    });
    expect(calls[2].body).toMatchObject({
      assetUrl: result.assetUrl,
      media: result.media,
      durationSec: 20,
    });
    expect(calls[3].body).toMatchObject({
      transcript: result.transcript,
      durationSec: 20,
    });
  });

  it("marks the segment failed when generation fails", async () => {
    const urls: string[] = [];
    const fetcher = (async (input) => {
      const url = String(input);
      urls.push(url);
      return url.endsWith("/v1/generations")
        ? response({ error: "provider_unavailable" }, 503)
        : response({ ok: true });
    }) as typeof fetch;

    const service = new SegmentPreparationService(
      "http://api.test",
      "http://generator.test",
      fetcher,
    );

    await expect(service.prepare(winner)).rejects.toThrow(
      "generator responded 503",
    );
    expect(urls).toEqual([
      "http://api.test/segments/segment_one/generating",
      "http://generator.test/v1/generations",
      "http://api.test/segments/segment_one/failed",
    ]);
  });
});
