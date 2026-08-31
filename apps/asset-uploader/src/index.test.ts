import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  publishedMediaForObjectKey,
  publishedObjectKey,
} from "@slopstream/shared";

import { handleAssetUpload } from "./index.js";

const TOKEN = "upload-secret";
const ASSET_BASE_URL = "https://assets.example.com/slopstream";
const AUDIO = new Uint8Array([1, 2, 3]);
const SHA256 = createHash("sha256").update(AUDIO).digest("hex");
const OBJECT_KEY = publishedObjectKey(SHA256, "audio/mpeg");

class MemoryBucket {
  readonly objects = new Map<
    string,
    { customMetadata?: Record<string, string> }
  >();

  async head(key: string) {
    return this.objects.get(key) ?? null;
  }

  async put(
    key: string,
    _value: ArrayBuffer,
    options: { customMetadata?: Record<string, string> },
  ) {
    this.objects.set(key, { customMetadata: options.customMetadata });
  }
}

function env(bucket = new MemoryBucket()): Env {
  return {
    ASSETS: bucket as unknown as R2Bucket,
    ASSET_BASE_URL,
    ASSET_UPLOAD_TOKEN: TOKEN,
  } as unknown as Env;
}

function putRequest(
  objectKey: string,
  init: {
    token?: string;
    contentType?: string;
    sha256?: string;
    body?: Uint8Array;
  } = {},
): Request {
  return new Request(`https://uploader.test/v1/assets/${objectKey}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${init.token ?? TOKEN}`,
      "content-type": init.contentType ?? "audio/mpeg",
      "x-content-sha256": init.sha256 ?? SHA256,
    },
    body: new Blob([init.body ?? AUDIO]),
  });
}

describe("asset uploader", () => {
  it("stores a content-addressed audio object and returns the public URL", async () => {
    const response = await handleAssetUpload(putRequest(OBJECT_KEY), env());
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      assetUrl: `${ASSET_BASE_URL}/${OBJECT_KEY}`,
    });
  });

  it("accepts image and video object keys", async () => {
    const image = new Uint8Array([9, 8, 7]);
    const imageSha = createHash("sha256").update(image).digest("hex");
    const imageKey = publishedObjectKey(imageSha, "image/png");
    const imageResponse = await handleAssetUpload(
      putRequest(imageKey, {
        contentType: "image/png",
        sha256: imageSha,
        body: image,
      }),
      env(),
    );
    expect(imageResponse.status).toBe(201);

    const video = new Uint8Array([4, 5, 6]);
    const videoSha = createHash("sha256").update(video).digest("hex");
    const videoKey = publishedObjectKey(videoSha, "video/mp4");
    const videoResponse = await handleAssetUpload(
      putRequest(videoKey, {
        contentType: "video/mp4",
        sha256: videoSha,
        body: video,
      }),
      env(),
    );
    expect(videoResponse.status).toBe(201);
  });

  it("replays an identical immutable upload without rewriting", async () => {
    const bucket = new MemoryBucket();
    const first = await handleAssetUpload(putRequest(OBJECT_KEY), env(bucket));
    const second = await handleAssetUpload(putRequest(OBJECT_KEY), env(bucket));
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(bucket.objects.size).toBe(1);
  });

  it("rejects an unauthorized or mismatched write", async () => {
    await expect(
      handleAssetUpload(putRequest(OBJECT_KEY, { token: "wrong" }), env()),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      handleAssetUpload(
        putRequest(OBJECT_KEY, { contentType: "image/png" }),
        env(),
      ),
    ).resolves.toMatchObject({ status: 415 });
    await expect(
      handleAssetUpload(
        new Request("https://uploader.test/v1/assets/nope.mp3", {
          method: "PUT",
          headers: {
            authorization: `Bearer ${TOKEN}`,
            "content-type": "audio/mpeg",
            "x-content-sha256": SHA256,
          },
          body: new Blob([AUDIO]),
        }),
        env(),
      ),
    ).resolves.toMatchObject({ status: 400 });
  });

  it("parses only approved content-addressed keys", () => {
    expect(publishedMediaForObjectKey(OBJECT_KEY)).toEqual({
      sha256: SHA256,
      contentType: "audio/mpeg",
      maxBytes: 25 * 1024 * 1024,
    });
    expect(
      publishedMediaForObjectKey("audio/not-a-digest.mp3"),
    ).toBeUndefined();
  });
});
