/**
 * OG-image fetching for visual grounding. For free (scraped) segments the
 * generator fetches the company page, extracts its Open Graph image, and
 * hands it to ElevenLabs image generation as a reference so the ad resembles
 * the real product. Every failure mode returns null so generation simply
 * proceeds without grounding.
 */

export type OgMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface OgImage {
  base64: string;
  mimeType: OgMimeType;
}

const HTML_TIMEOUT_MS = 5_000;
const IMAGE_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 1_000_000;
const MAX_IMAGE_BYTES = 8_000_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/127.0 Safari/537.36";

const META_TAGS = /<meta\b[^>]*>/gi;
const CONTENT_ATTR = /content\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * Extract the og:image (falling back to twitter:image) URL from page HTML,
 * resolving relative URLs against the page. Returns only http(s) URLs.
 */
export function extractOgImageUrl(
  html: string,
  pageUrl: string,
): string | undefined {
  for (const name of ["og:image", "twitter:image"]) {
    const key = new RegExp(`(?:property|name)\\s*=\\s*["']?${name}["']?`, "i");
    for (const tag of html.match(META_TAGS) ?? []) {
      if (!key.test(tag)) continue;
      const content = tag.match(CONTENT_ATTR);
      const raw = (content?.[1] ?? content?.[2])?.trim();
      if (!raw) continue;
      try {
        const resolved = new URL(raw, pageUrl);
        if (resolved.protocol === "http:" || resolved.protocol === "https:") {
          return resolved.toString();
        }
      } catch {
        // Unresolvable tag — keep scanning.
      }
    }
  }
  return undefined;
}

export interface FetchOgImageOptions {
  htmlTimeoutMs?: number;
  imageTimeoutMs?: number;
  fetcher?: typeof fetch;
}

/** Fetch the page, find its OG image, and download it as base64. */
export async function fetchOgImage(
  sourceUrl: string,
  options: FetchOgImageOptions = {},
): Promise<OgImage | null> {
  const fetcher = options.fetcher ?? fetch;
  try {
    const page = await fetcher(sourceUrl, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(options.htmlTimeoutMs ?? HTML_TIMEOUT_MS),
    });
    if (!page.ok || !page.body) return null;
    const htmlBytes = await readCappedBytes(page.body, MAX_HTML_BYTES);
    if (!htmlBytes) return null;
    const html = new TextDecoder("utf-8").decode(htmlBytes);

    const imageUrl = extractOgImageUrl(html, sourceUrl);
    if (!imageUrl) return null;

    const image = await fetcher(imageUrl, {
      headers: { "user-agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(options.imageTimeoutMs ?? IMAGE_TIMEOUT_MS),
    });
    if (!image.ok || !image.body) return null;
    const imageBytes = await readCappedBytes(image.body, MAX_IMAGE_BYTES);
    if (!imageBytes) return null;

    const mimeType = sniffMime(image.headers.get("content-type"), imageBytes);
    if (!mimeType) return null;

    return {
      base64: Buffer.from(imageBytes).toString("base64"),
      mimeType,
    };
  } catch {
    return null;
  }
}

/** Read a stream fully, returning null if it exceeds the cap. */
async function readCappedBytes(
  body: ReadableStream<Uint8Array>,
  cap: number,
): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Accept only the three mime types ElevenLabs image references allow. */
function sniffMime(
  contentType: string | null,
  bytes: Uint8Array,
): OgMimeType | null {
  const declared = contentType?.split(";")[0]?.trim().toLowerCase();
  if (
    declared === "image/jpeg" ||
    declared === "image/png" ||
    declared === "image/webp"
  ) {
    return declared;
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}
