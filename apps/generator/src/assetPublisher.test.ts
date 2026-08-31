import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { publishedObjectKey } from "@slopstream/shared";

import {
  createAssetPublisherFromEnv,
  HttpAssetPublisher,
  LocalDirectoryAssetPublisher,
} from "./assetPublisher.js";

const BYTES = new Uint8Array([1, 2, 3]);
const SHA256 = createHash("sha256").update(BYTES).digest("hex");

describe("LocalDirectoryAssetPublisher", () => {
  it("writes a content-addressed file under /assets/", async () => {
    const assetsDir = await mkdtemp(join(tmpdir(), "slopstream-assets-"));
    const publisher = new LocalDirectoryAssetPublisher(
      assetsDir,
      "https://assets.example.test",
    );

    const published = await publisher.publish(BYTES, "audio/mpeg");

    expect(published).toEqual({
      url: `https://assets.example.test/assets/${SHA256}.mp3`,
      sha256: SHA256,
      objectKey: `${SHA256}.mp3`,
      contentType: "audio/mpeg",
    });
    await expect(readFile(join(assetsDir, `${SHA256}.mp3`))).resolves.toEqual(
      Buffer.from(BYTES),
    );
  });
});

describe("HttpAssetPublisher", () => {
  it("PUTs a prefixed object key and returns the public URL", async () => {
    const objectKey = publishedObjectKey(SHA256, "image/png");
    const assetUrl = `https://cdn.example.test/${objectKey}`;
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ assetUrl }), { status: 201 }),
      );
    const publisher = new HttpAssetPublisher(
      "https://uploader.example.test",
      "secret",
      fetcher,
    );

    const published = await publisher.publish(BYTES, "image/png");

    expect(published.url).toBe(assetUrl);
    expect(published.objectKey).toBe(objectKey);
    expect(fetcher).toHaveBeenCalledWith(
      `https://uploader.example.test/v1/assets/${objectKey}`,
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          authorization: "Bearer secret",
          "content-type": "image/png",
          "x-content-sha256": SHA256,
        }),
      }),
    );
  });

  it("rejects a non-public URL from the upload boundary", async () => {
    const publisher = new HttpAssetPublisher(
      "https://uploader.example.test",
      "secret",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ assetUrl: "http://127.0.0.1/audio/x.mp3" }),
            { status: 201 },
          ),
        ),
    );

    await expect(publisher.publish(BYTES, "audio/mpeg")).rejects.toThrow(
      "asset uploader returned an invalid asset URL",
    );
  });
});

describe("createAssetPublisherFromEnv", () => {
  it("uses local publication unless both upload URL and token are set", () => {
    const local = {
      assetsDir: "/tmp/assets",
      assetBaseUrl: "https://assets.example.test",
    };
    expect(createAssetPublisherFromEnv({}, local)).toBeInstanceOf(
      LocalDirectoryAssetPublisher,
    );
    expect(() =>
      createAssetPublisherFromEnv(
        { ASSET_UPLOAD_URL: "https://uploader.example.test" },
        local,
      ),
    ).toThrow("ASSET_UPLOAD_TOKEN");
    expect(
      createAssetPublisherFromEnv(
        {
          ASSET_UPLOAD_URL: "https://uploader.example.test",
          ASSET_UPLOAD_TOKEN: "secret",
        },
        local,
      ),
    ).toBeInstanceOf(HttpAssetPublisher);
  });
});
