import type { Segment } from "@slopstream/shared";

/**
 * Return the explicit manifest audio when present. Historical records may
 * retain a direct MP3 `assetUrl`; accept only that complete URL and never
 * construct a sibling narration URL from a visual filename.
 */
export function playbackAudioUrl(
  segment: Pick<Segment, "assetUrl" | "media"> | null | undefined,
): string | undefined {
  const manifestUrl = segment?.media?.audio.url;
  if (manifestUrl) return manifestUrl;

  const legacyUrl = segment?.assetUrl;
  if (!legacyUrl) return undefined;
  try {
    const url = new URL(legacyUrl);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /\.mp3$/i.test(url.pathname)
      ? legacyUrl
      : undefined;
  } catch {
    return undefined;
  }
}
