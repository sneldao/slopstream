import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  isPublicMediaUrl,
  PUBLISHED_MEDIA,
  publishedMediaForObjectKey,
  publishedObjectKey,
  type PublishedMediaContentType,
} from "@slopstream/shared";

type Environment = Readonly<Record<string, string | undefined>>;

export interface PublishedAsset {
  url: string;
  sha256: string;
  objectKey: string;
  contentType: PublishedMediaContentType;
}

export interface AssetPublisher {
  publish(
    bytes: Uint8Array,
    contentType: PublishedMediaContentType,
  ): Promise<PublishedAsset>;
}

function requiredEnvironmentValue(
  environment: Environment,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for remote asset publication`);
  }
  return value;
}

function parseAbsoluteUrl(value: string, name: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assetUrlFromResponse(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const assetUrl = (value as Record<string, unknown>).assetUrl;
  return typeof assetUrl === "string" && assetUrl.trim() ? assetUrl : undefined;
}

function uploadUrlFor(assetUploadUrl: string, objectKey: string): string {
  const base = assetUploadUrl.endsWith("/")
    ? assetUploadUrl
    : `${assetUploadUrl}/`;
  return new URL(`v1/assets/${objectKey}`, base).toString();
}

function publicAssetBaseUrl(value: string): string {
  if (!isPublicMediaUrl(value)) {
    throw new Error("ASSET_BASE_URL must be a queryless public HTTPS URL");
  }
  return new URL(value).toString().replace(/\/$/, "");
}

/** Writes content-addressed files for the generator's `/assets/` route. */
export class LocalDirectoryAssetPublisher implements AssetPublisher {
  constructor(
    private readonly assetsDir: string,
    private readonly assetBaseUrl: string,
  ) {}

  async publish(
    bytes: Uint8Array,
    contentType: PublishedMediaContentType,
  ): Promise<PublishedAsset> {
    const sha256 = sha256Hex(bytes);
    const spec = PUBLISHED_MEDIA[contentType];
    const objectKey = `${sha256}.${spec.extension}`;
    await mkdir(this.assetsDir, { recursive: true });
    await writeFile(join(this.assetsDir, objectKey), bytes);
    return {
      url: `${publicAssetBaseUrl(this.assetBaseUrl)}/assets/${objectKey}`,
      sha256,
      objectKey,
      contentType,
    };
  }
}

/** Authenticated PUT to the Cloudflare asset-uploader Worker. */
export class HttpAssetPublisher implements AssetPublisher {
  constructor(
    private readonly assetUploadUrl: string,
    private readonly assetUploadToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async publish(
    bytes: Uint8Array,
    contentType: PublishedMediaContentType,
  ): Promise<PublishedAsset> {
    const sha256 = sha256Hex(bytes);
    const objectKey = publishedObjectKey(sha256, contentType);
    const url = await this.upload(objectKey, bytes, sha256, contentType);
    return { url, sha256, objectKey, contentType };
  }

  async upload(
    objectKey: string,
    body: Uint8Array,
    sha256: string,
    contentType: PublishedMediaContentType,
  ): Promise<string> {
    const published = publishedMediaForObjectKey(objectKey);
    if (!published || published.sha256 !== sha256) {
      throw new Error("asset object key does not match the published digest");
    }
    const response = await this.fetcher(
      uploadUrlFor(this.assetUploadUrl, objectKey),
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${this.assetUploadToken}`,
          "content-type": contentType,
          "x-content-sha256": sha256,
        },
        body: new Uint8Array(body),
      },
    );
    if (!response.ok) {
      throw new Error(`asset upload failed with status ${response.status}`);
    }

    const assetUrl = assetUrlFromResponse(await response.json());
    if (assetUrl === undefined || !isPublicMediaUrl(assetUrl)) {
      throw new Error("asset uploader returned an invalid asset URL");
    }
    return assetUrl;
  }
}

export function createAssetPublisherFromEnv(
  environment: Environment,
  local: { assetsDir: string; assetBaseUrl: string },
  fetcher: typeof fetch = fetch,
): AssetPublisher {
  const uploadUrl = environment.ASSET_UPLOAD_URL?.trim();
  const uploadToken = environment.ASSET_UPLOAD_TOKEN?.trim();
  if (uploadUrl || uploadToken) {
    const parsed = parseAbsoluteUrl(
      requiredEnvironmentValue(environment, "ASSET_UPLOAD_URL"),
      "ASSET_UPLOAD_URL",
    );
    return new HttpAssetPublisher(
      parsed.toString(),
      requiredEnvironmentValue(environment, "ASSET_UPLOAD_TOKEN"),
      fetcher,
    );
  }
  return new LocalDirectoryAssetPublisher(local.assetsDir, local.assetBaseUrl);
}
