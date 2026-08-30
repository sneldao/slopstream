import type { Segment } from "@slopstream/shared";

// Stream orchestrator responsibilities (see docs/technical/architecture.md):
// - queue manager / segment scheduler
// - stream continuity (Infinite Slop)
// - attention challenge timing (when to fire, not what they are)
//
// The orchestrator NEVER resolves auctions or settles money — the backend
// ledger (apps/api) is the single source of truth for both. The orchestrator
// consumes auction results from Lane 2; it does not produce them.

const queue: Segment[] = [];

function enqueueFreeSlot(slot: number): Segment {
  const segment: Segment = {
    id: `seg_free_${slot}`,
    slot,
    brandId: null,
    durationSeconds: 30,
    summary: "",
    status: "queued",
  };
  queue.push(segment);
  return segment;
}

enqueueFreeSlot(1);
console.log(`slopstream orchestrator up, queue depth: ${queue.length}`);
