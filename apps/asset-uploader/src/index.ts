import { timingSafeEqual } from "node:crypto";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ASSET_PREFIX = "/v1/assets/";
const AUDIO_CONTENT_TYPE = "audio/mpeg";

function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function objectKeyFromRequest(url: URL): string | undefined {
  if (!url.pathname.startsWith(ASSET_PREFIX)) {
    return undefined;
  }

  const encodedKey = url.pathname.slice(ASSET_PREFIX.length);
  if (!encodedKey) {
    return undefined;
  }

  try {
    const objectKey = decodeURIComponent(encodedKey);
    return objectKey.startsWith("audio/") && objectKey.endsWith(".mp3")
      ? objectKey
      : undefined;
  } catch {
    return undefined;
  }
}

function assetUrlFor(assetBaseUrl: string, objectKey: string): string {
  const base = assetBaseUrl.endsWith("/") ? assetBaseUrl : `${assetBaseUrl}/`;
  return new URL(objectKey, base).toString();
}

async function hasValidAuthorization(
  request: Request,
  uploadToken: string,
): Promise<boolean> {
  const authorization = request.headers.get("authorization");
  if (authorization === null) {
    return false;
  }

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

export default {
  async fetch(request, env): Promise<Response> {
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
    if (objectKey === undefined) {
      return errorResponse(400, "invalid_asset_key");
    }

    if (request.headers.get("content-type") !== AUDIO_CONTENT_TYPE) {
      return errorResponse(415, "unsupported_media_type");
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) > MAX_AUDIO_BYTES) {
      return errorResponse(413, "payload_too_large");
    }
    if (request.body === null) {
      return errorResponse(400, "missing_body");
    }

    await env.ASSETS.put(objectKey, request.body, {
      httpMetadata: { contentType: AUDIO_CONTENT_TYPE },
    });

    return Response.json(
      { assetUrl: assetUrlFor(env.ASSET_BASE_URL, objectKey) },
      { status: 201 },
    );
  },
} satisfies ExportedHandler<Env>;
