// Marketplace ingestion — polls GET /events?after=N on the Lane 2 API and
// re-wraps every delivery into the gateway's sequence space. Polling is the
// correctness layer: it is gap-free (sequence cursor over the API's ring
// buffer) and survives API restarts by detecting a backwards sequence jump
// and resetting the cursor. (A Redis pub/sub subscription on
// `slopstream:marketplace` is a documented follow-up; pub/sub is lossy so it
// would still sit on top of this.)

import type { WsDelivery, WsEvent } from "@slopstream/shared";
import type { ApiClient } from "./apiClient.js";

export interface EventsBatch {
  deliveries: WsDelivery[];
  asOfSequence: number;
}

export interface ResolvedBatch {
  /** True when the API sequence space rewound (API restart) and the cursor
   *  was reset — deliveries are then the full replayable history. */
  reset: boolean;
  /** Deliveries to ingest, in order. */
  deliveries: WsDelivery[];
  /** Cursor for the next poll. */
  nextCursor: number;
}

/**
 * Pure cursor advancement: given the last-seen API sequence and one
 * /events?after response, decide what to ingest and where the cursor moves.
 */
export function resolveBatch(
  cursor: number,
  batch: EventsBatch,
): ResolvedBatch {
  if (batch.asOfSequence < cursor) {
    // Backwards jump — the API restarted and its sequence space rewound.
    // Replay everything it still holds; clients dedupe by eventId.
    return {
      reset: true,
      deliveries: batch.deliveries,
      nextCursor: batch.asOfSequence,
    };
  }
  const fresh = batch.deliveries.filter((d) => d.sequence > cursor);
  return {
    reset: false,
    deliveries: fresh,
    nextCursor: Math.max(cursor, batch.asOfSequence),
  };
}

export type FeedIngest = (event: WsEvent, eventId: string) => void;

export class MarketplaceFeed {
  private cursor = 0;
  private stopped = true;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly client: ApiClient,
    private readonly pollMs: number,
    private readonly ingest: FeedIngest,
  ) {}

  start(): void {
    this.stopped = false;
    console.log(`[feed] polling API /events every ${this.pollMs}ms`);
    void this.poll();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private async poll(): Promise<void> {
    if (this.stopped) return;
    try {
      const batch = await this.client.eventsSince(this.cursor);
      const { reset, deliveries, nextCursor } = resolveBatch(
        this.cursor,
        batch,
      );
      if (reset) {
        console.warn("[feed] API sequence rewound — resetting cursor");
      }
      for (const delivery of deliveries) {
        this.ingest(delivery.event, delivery.eventId);
      }
      this.cursor = nextCursor;
    } catch {
      // API not ready yet; retry on the next tick.
    }
    if (!this.stopped) {
      this.timer = setTimeout(() => void this.poll(), this.pollMs);
      this.timer.unref();
    }
  }
}
