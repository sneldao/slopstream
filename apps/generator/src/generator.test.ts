import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createStubGenerator,
  generate,
  InMemoryGenerationJobStore,
  MAX_COMPLETED_GENERATIONS,
  StubGenerationProvider,
} from "./generator.js";
import { createGeneratorServer } from "./server.js";

const TEST_ASSET_BASE_URL = "https://assets.example.test";

const request = {
  segmentId: "segment:one",
  brandId: "brand:one",
  brief: "Launch a friendly database backup service.",
  tier: "audio_image" as const,
  previousSummaries: ["A sleepy server became reliable."],
};

describe("stub generator", () => {
  it("returns a tier-appropriate result while preserving Lane 2's segment ID", () => {
    const result = generate(request, TEST_ASSET_BASE_URL);

    expect(result).toMatchObject({
      segmentId: request.segmentId,
      assetUrl: expect.stringContaining("/assets/seg_verify_clean.png"),
      durationSec: 30,
      audioMetadata: { mode: "stub", tier: "audio_image" },
      visualMetadata: { mode: "stub", tier: "audio_image" },
    });
    expect(result.transcript).toContain(request.brief);
    expect(result.summary).toContain(request.previousSummaries[0]);
  });

  it("replays identical segment requests and rejects conflicting reuse", async () => {
    const generator = createStubGenerator(TEST_ASSET_BASE_URL);

    const first = await generator.generate(request);
    const replay = await generator.generate({ ...request });
    const conflict = await generator.generate({
      ...request,
      brief: "Generate unrelated content for the same segment.",
    });

    expect(first).toMatchObject({
      status: "generated",
      result: { segmentId: request.segmentId },
    });
    expect(replay).toMatchObject({
      status: "replayed",
      result: { segmentId: request.segmentId },
    });
    expect(conflict).toEqual({ status: "conflict" });
  });

  it("keeps audio results audio-only", () => {
    const result = generate({ ...request, tier: "audio" }, TEST_ASSET_BASE_URL);

    expect(result.assetUrl).toContain("/assets/approval-sample-002.mp3");
    expect(result.visualMetadata).toBeUndefined();
  });

  it("evicts the oldest completed generations beyond the in-memory cap", async () => {
    const store = new InMemoryGenerationJobStore();
    const result = generate(request, TEST_ASSET_BASE_URL);

    for (let i = 0; i < MAX_COMPLETED_GENERATIONS + 1; i += 1) {
      await store.put(`segment:${i}`, {
        fingerprint: `fingerprint:${i}`,
        result,
      });
    }

    await expect(store.get("segment:0")).resolves.toBeUndefined();
    await expect(
      store.get(`segment:${MAX_COMPLETED_GENERATIONS}`),
    ).resolves.toMatchObject({
      fingerprint: `fingerprint:${MAX_COMPLETED_GENERATIONS}`,
    });
  });
});

describe("generator HTTP boundary", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createGeneratorServer({
      provider: new StubGenerationProvider(TEST_ASSET_BASE_URL),
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );

  async function postGeneration(body: unknown): Promise<Response> {
    return fetch(`${baseUrl}/v1/generations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("reports stub mode and makes duplicate generation requests safe", async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      generatorMode: "stub",
    });

    const created = await postGeneration(request);
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      segmentId: request.segmentId,
    });

    const replay = await postGeneration(request);
    expect(replay.status).toBe(200);

    const conflict = await postGeneration({
      ...request,
      brief: "A different brief cannot claim this segment ID.",
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({
      error: "segment_conflict",
    });
  });

  it("serves the bundled stub fixture under the advertised assets path", async () => {
    const generated = generate(request, TEST_ASSET_BASE_URL);
    const asset = await fetch(`${baseUrl}/assets/approval-sample-002.mp3`);
    const bytes = new Uint8Array(await asset.arrayBuffer());

    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toBe("audio/mpeg");
    expect(asset.headers.get("cache-control")).toBe("no-store");
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      generated.media.audio.sha256,
    );
  });

  it("protects generation work when a service token is configured", async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    server = createGeneratorServer({
      apiToken: "generator-secret",
      provider: new StubGenerationProvider(TEST_ASSET_BASE_URL),
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    expect((await postGeneration(request)).status).toBe(401);
    const authorized = await fetch(`${baseUrl}/v1/generations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer generator-secret",
      },
      body: JSON.stringify(request),
    });
    expect(authorized.status).toBe(201);
  });
});
