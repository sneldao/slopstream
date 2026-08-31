import type { Segment } from "@slopstream/shared";

export interface PublicPricePoint {
  segmentId: string;
  slot: number;
  amountUsd: number;
  clearedAt: string | null;
}

export function priceHistoryFromSegments(
  segments: Segment[],
  options: { limit?: number; since?: number } = {},
): PublicPricePoint[] {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 50), 1), 500);
  return segments
    .filter(
      (segment) =>
        segment.clearedAmountUsd !== undefined &&
        (options.since === undefined ||
          (segment.clearedAtMs !== undefined &&
            segment.clearedAtMs >= options.since)),
    )
    .slice(0, limit)
    .map((segment) => ({
      segmentId: segment.id,
      slot: segment.slot,
      amountUsd: segment.clearedAmountUsd!,
      clearedAt:
        segment.clearedAtMs !== undefined
          ? new Date(segment.clearedAtMs).toISOString()
          : null,
    }));
}

export function priceHistoryCsv(points: PublicPricePoint[]): string {
  const rows = ["segmentId,slot,amountUsd,clearedAt"];
  for (const point of points) {
    rows.push(
      [point.segmentId, point.slot, point.amountUsd, point.clearedAt ?? ""]
        .map(csvCell)
        .join(","),
    );
  }
  return `${rows.join("\n")}\n`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
