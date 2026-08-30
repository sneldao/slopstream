import { timingSafeEqual } from "node:crypto";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ASSET_PREFIX = "/v1/assets/";
const AUDIO_CONTENT_TYPE = "audio/mpeg";

function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

/**
 * Keys are resolved against the asset base URL with `new URL(...)`, so reject
 * traversal segments (".."), empty segments, and absolute keys before they can
 * escape the bucket prefix.
 */
function isSafeObjectKey(objectKey: string): boolean {
  if (objectKey.startsWith("/")) {
    return false;
  }
  return objectKey
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "..");
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
    return objectKey.startsWith("audio/") &&
      objectKey.endsWith(".mp3") &&
      isSafeObjectKey(objectKey)
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

/**
 * The content-length header can be absent (chunked uploads) or lie, so the
 * limit is also enforced while the body streams into R2: the stream errors as
 * soon as MAX_AUDIO_BYTES is exceeded and the put is rejected below.
 */
function cappedBody(
  body: ReadableStream<Uint8Array>,
  onOversize: () => void,
): ReadableStream<Uint8Array> {
  let receivedBytes = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        receivedBytes += chunk.byteLength;
        if (receivedBytes > MAX_AUDIO_BYTES) {
          onOversize();
          controller.error(new Error("payload_too_large"));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
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

    let oversize = false;
    try {
      await env.ASSETS.put(
        objectKey,
        cappedBody(request.body, () => {
          oversize = true;
        }),
        {
          httpMetadata: { contentType: AUDIO_CONTENT_TYPE },
        },
      );
    } catch {
      return errorResponse(
        oversize ? 413 : 502,
        oversize ? "payload_too_large" : "upload_failed",
      );
    }

    return Response.json(
      { assetUrl: assetUrlFor(env.ASSET_BASE_URL, objectKey) },
      { status: 201 },
    );
  },
} satisfies ExportedHandler<Env>;
