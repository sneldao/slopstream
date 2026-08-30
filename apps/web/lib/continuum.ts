import type { BrandSummary, Segment } from "@slopstream/shared";

/** Human Continuum title — chapter story, not a raw segment id. */
export function continuumChapter(
  segment: Pick<Segment, "slot" | "summary">,
  brand?: BrandSummary | null,
): string {
  const who = brand?.name ?? "Open stream";
  return `Chapter ${segment.slot} · ${who}`;
}

/** Short story line from the Continuum summary. */
export function continuumBlurb(segment: Pick<Segment, "summary">): string {
  const text = segment.summary.trim();
  if (!text) return "The Continuum is writing the next moment.";
  if (text.length <= 96) return text;
  return `${text.slice(0, 93).trimEnd()}…`;
}
