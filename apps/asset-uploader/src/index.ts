import { timingSafeEqual } from "node:crypto";
import {
  isPublishedMediaContentType,
  publishedMediaForObjectKey,
} from "@slopstream/shared";

const ASSET_PREFIX = "/v1/assets/";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function objectKeyFromRequest(url: URL): string | undefined {
  if (!url.pathname.startsWith(ASSET_PREFIX)) return undefined;
  const encodedKey = url.pathname.slice(ASSET_PREFIX.length);
  if (!encodedKey) return undefined;

  try {
    const objectKey = decodeURIComponent(encodedKey);
    return publishedMediaForObjectKey(objectKey) ? objectKey : undefined;
  } catch {
    return undefined;
  }
}

function assetUrlFor(assetBaseUrl: string, objectKey: string): string {
  const base = assetBaseUrl.endsWith("/") ? assetBaseUrl : `${assetBaseUrl}/`;
  return new URL(objectKey, base).toString();
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function hasValidAuthorization(
  request: Request,
  uploadToken: string,
): Promise<boolean> {
  const authorization = request.headers.get("authorization");
  if (authorization === null) return false;

  const encoder = new TextEncoder();
  const expected = encoder.encode(`Bearer ${uploadToken}`);
  const actual = encoder.encode(authorization);
  return (
    expected.byteLength === actual.byteLength &&
    timingSafeEqual(expected, actual)
  );
}

function uploadTokenFromEnvironment(env: Env): string | undefined {
  const value = Reflect.get(env, "ASSET_UPLOAD_TOKEN");
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Authenticated, content-addressed write boundary for public media. The
 * digest appears in both the immutable object key and request header, then is
 * recomputed from the received bytes before R2 is touched.
 */
export async function handleAssetUpload(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "PUT") {
    return errorResponse(405, "method_not_allowed");
  }

  const uploadToken = uploadTokenFromEnvironment(env);
  if (
    uploadToken === undefined ||
    !(await hasValidAuthorization(request, uploadToken))
  ) {
    return errorResponse(401, "unauthorized");
  }

  const objectKey = objectKeyFromRequest(new URL(request.url));
  const published = objectKey
    ? publishedMediaForObjectKey(objectKey)
    : undefined;
  if (!objectKey || !published) {
    return errorResponse(400, "invalid_asset_key");
  }

  const contentType = request.headers.get("content-type");
  if (
    contentType === null ||
    !isPublishedMediaContentType(contentType) ||
    contentType !== published.contentType
  ) {
    return errorResponse(415, "unsupported_media_type");
  }
  if (request.headers.get("x-content-sha256") !== published.sha256) {
    return errorResponse(400, "checksum_key_mismatch");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > published.maxBytes) {
    return errorResponse(413, "payload_too_large");
  }
  if (request.body === null) return errorResponse(400, "missing_body");

  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    return errorResponse(400, "invalid_body");
  }
  if (bytes.byteLength > published.maxBytes) {
    return errorResponse(413, "payload_too_large");
  }
  if ((await sha256Hex(bytes)) !== published.sha256) {
    return errorResponse(400, "checksum_mismatch");
  }

  try {
    const existing = await env.ASSETS.head(objectKey);
    if (existing) {
      if (existing.customMetadata?.sha256 !== published.sha256) {
        return errorResponse(409, "immutable_asset_conflict");
      }
      return Response.json(
        { assetUrl: assetUrlFor(env.ASSET_BASE_URL, objectKey) },
        { status: 200 },
      );
    }
    await env.ASSETS.put(objectKey, bytes, {
      httpMetadata: {
        contentType: published.contentType,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      },
      customMetadata: { sha256: published.sha256 },
    });
  } catch {
    return errorResponse(502, "upload_failed");
  }

  return Response.json(
    { assetUrl: assetUrlFor(env.ASSET_BASE_URL, objectKey) },
    { status: 201 },
  );
}

export default {
  async fetch(request, env): Promise<Response> {
    return handleAssetUpload(request, env);
  },
} satisfies ExportedHandler<Env>;
