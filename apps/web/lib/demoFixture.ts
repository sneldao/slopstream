/**
 * Demo-mode fixture — the on-stage insurance policy.
 *
 * A versioned, fixture-driven demo sequence that drives the entire UI (big
 * screen, listener, brand console) with no live API, generator, or contracts
 * (see docs/hackathon/build-order.md "Demo-mode harness" and team-split.md
 * "Sequencing risk"). Lane 3 owns the player; Lanes 1–2 supply canned
 * proof/clearing data inside the steps.
 *
 * The player is a pure function of this fixture: identical `version` + `steps`
 * produce an identical run, so the sequence is deterministic and replayable
 * across rehearsals. A real run swaps `initialSnapshot` for
 * `GET /stream/snapshot` and the `delivery` events for the live WebSocket
 * feed; the `WsDelivery` shape is identical, so the player code path doesn't
 * change.
 *
 * The sequence mirrors docs/hackathon/demo-script.md scene-by-scene.
 */

import type {
  BrandSummary,
  DemoFixture,
  StreamSnapshot,
  WsDelivery,
  WsEvent,
} from "@slopstream/shared";

// ---------------------------------------------------------------------------
// Brands — the three scripted demo brands. Palettes drive the OUTBID color
// wash, leaderboard chips, listener screen tint, and clearing particles.
// ---------------------------------------------------------------------------

export const DEMO_BRANDS: BrandSummary[] = [
  {
    id: "brand_acme",
    name: "Acme AI",
    primaryColor: "#1e6fff",
    secondaryColor: "#8ab4ff",
  },
  {
    id: "brand_coolstartup",
    name: "CoolStartup",
    primaryColor: "#ff8a1e",
    secondaryColor: "#ffd08a",
  },
  {
    id: "brand_dogfood",
    name: "Dogfood AI",
    primaryColor: "#8a2be2",
    secondaryColor: "#d6a8ff",
  },
];

// ---------------------------------------------------------------------------
// Initial snapshot — Scene 1: empty market.
// Two companies sitting in the queue, nothing playing yet.
// ---------------------------------------------------------------------------

const INITIAL_SNAPSHOT: StreamSnapshot = {
  asOfSequence: 0,
  nowPlaying: null,
  recentSegments: [
    {
      id: "seg_archive_2",
      slot: -1,
      brandId: "brand_acme",
      durationSeconds: 24,
      summary: "An office robot discovers that attention has a price.",
      status: "done",
    },
    {
      id: "seg_archive_1",
      slot: -2,
      brandId: "brand_dogfood",
      durationSeconds: 18,
      summary: "A purple dog launches a startup from inside a vending machine.",
      status: "done",
    },
  ],
  upcomingSegments: [],
  brands: DEMO_BRANDS,
  leaderboard: [],
  nextSlotPriceUsd: 5,
  listeners: 1284,
  attentionProofs: 0,
  listenerRewardsUsd: 0,
};

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

let seq = 0;
function step(
  event: WsEvent,
  delayMsAfter: number,
  label?: string,
): {
  delivery: WsDelivery;
  delayMsAfter: number;
  label?: string;
} {
  seq += 1;
  return {
    label,
    delayMsAfter,
    delivery: {
      eventId: `demo_evt_${seq.toString().padStart(3, "0")}`,
      sequence: seq,
      event,
    },
  };
}

function hold(
  delayMsAfter: number,
  label?: string,
): {
  delayMsAfter: number;
  label?: string;
} {
  return { label, delayMsAfter };
}

export const DEMO_FIXTURE: DemoFixture = {
  version: 1,
  id: "hackathon-main",
  description:
    "Eight-scene hackathon demo: empty market → Acme escalates → CoolStartup outbids → AI generation → challenge → attention verified → $18 clears → Dogfood bids again.",
  initialSnapshot: INITIAL_SNAPSHOT,

  steps: [
    // --- Scene 1: Empty market -------------------------------------------
    hold(1500, "Scene 1 — Empty market"),

    // --- Scene 2: First bid — Acme escalates $5 -> $10 -> $15 ------------
    step(
      {
        type: "bid.placed",
        bidId: "bid_acme_1",
        brandId: "brand_acme",
        amountUsd: 5,
        slot: 1,
      },
      400,
      "Scene 2 — Acme bids $5",
    ),
    step(
      {
        type: "leaderboard.updated",
        ranking: [{ brandId: "brand_acme", amountUsd: 5 }],
        nextSlotPriceUsd: 6,
      },
      1800,
    ),
    step(
      {
        type: "bid.placed",
        bidId: "bid_acme_1",
        brandId: "brand_acme",
        amountUsd: 10,
        slot: 1,
      },
      400,
    ),
    step(
      {
        type: "leaderboard.updated",
        ranking: [{ brandId: "brand_acme", amountUsd: 10 }],
        nextSlotPriceUsd: 11,
      },
      1800,
    ),
    step(
      {
        type: "bid.placed",
        bidId: "bid_acme_1",
        brandId: "brand_acme",
        amountUsd: 15,
        slot: 1,
      },
      400,
    ),
    step(
      {
        type: "leaderboard.updated",
        ranking: [{ brandId: "brand_acme", amountUsd: 15 }],
        nextSlotPriceUsd: 16,
      },
      2000,
    ),

    // --- Scene 3: Outbid — CoolStartup $18 --------------------------------
    step(
      {
        type: "bid.placed",
        bidId: "bid_cool_1",
        brandId: "brand_coolstartup",
        amountUsd: 18,
        slot: 1,
      },
      150,
      "Scene 3 — CoolStartup outbids $18",
    ),
    step(
      {
        type: "bid.outbid",
        slot: 1,
        displacedBidId: "bid_acme_1",
        displacedBrandId: "brand_acme",
        newBidId: "bid_cool_1",
        newBrandId: "brand_coolstartup",
        prevAmountUsd: 15,
        newAmountUsd: 18,
      },
      400,
    ),
    step(
      {
        type: "leaderboard.updated",
        ranking: [
          { brandId: "brand_coolstartup", amountUsd: 18 },
          { brandId: "brand_acme", amountUsd: 15 },
        ],
        nextSlotPriceUsd: 19,
      },
      2200,
    ),

    // --- Scene 4: AI generation — CoolStartup wins slot 1 -----------------
    step(
      {
        type: "segment.generating",
        segmentId: "seg_392",
        slot: 1,
        tier: "video",
        brandId: "brand_coolstartup",
      },
      900,
      "Scene 4 — AI generation",
    ),
    step(
      { type: "generation.progress", slot: 1, stage: "script", done: true },
      900,
    ),
    step(
      { type: "generation.progress", slot: 1, stage: "voice", done: true },
      900,
    ),
    step(
      { type: "generation.progress", slot: 1, stage: "image", done: true },
      900,
    ),
    step(
      { type: "generation.progress", slot: 1, stage: "video", done: true },
      600,
    ),
    step(
      {
        type: "segment.ready",
        segmentId: "seg_392",
        assetUrl: "https://placeholders.slopstream.local/seg_392.mp4",
        durationSec: 30,
      },
      800,
    ),
    step(
      {
        type: "segment.playing",
        segmentId: "seg_392",
        brandId: "brand_coolstartup",
        startedAt: new Date("2026-08-30T12:00:00Z").toISOString(),
      },
      3000,
    ),

    // --- Scene 5: QR challenge fires --------------------------------------
    step(
      {
        type: "challenge.fired",
        challenge: {
          id: "chal_392_1",
          type: "recall",
          question: "What database did CoolStartup say it supports?",
          options: ["Redis", "Postgres", "MongoDB", "SQLite"],
          segmentId: "seg_392",
          validFrom: 8,
          validUntil: 22,
          difficulty: 2,
        },
      },
      2500,
      "Scene 5 — Challenge fires",
    ),

    // --- Scene 6: Proof — verified count climbs, threshold met ------------
    // threshold = 120; total listeners in window = 143.
    step(
      {
        type: "attention.verified",
        segmentId: "seg_392",
        verifiedCount: 64,
        total: 143,
        threshold: 120,
      },
      1800,
      "Scene 6 — Attention verified",
    ),
    step(
      {
        type: "attention.verified",
        segmentId: "seg_392",
        verifiedCount: 98,
        total: 143,
        threshold: 120,
      },
      1800,
    ),
    step(
      {
        type: "attention.verified",
        segmentId: "seg_392",
        verifiedCount: 127,
        total: 143,
        threshold: 120,
      },
      1500,
    ),

    // --- Scene 7: Money — $18 clears, 80/20 split -------------------------
    step(
      {
        type: "bid.cleared",
        bidId: "bid_cool_1",
        segmentId: "seg_392",
        grossAmountUsd: 18,
        listenerPoolUsd: 14.4,
        platformRevenueUsd: 3.6,
      },
      600,
      "Scene 7 — $18 clears",
    ),
    step(
      {
        type: "reward.pool.updated",
        poolId: "pool_392",
        bidId: "bid_cool_1",
        eligibleAmountUsd: 14.4,
        distributedAmountUsd: 0,
      },
      800,
    ),
    step(
      {
        type: "stats.updated",
        listeners: 1284,
        attentionProofs: 127,
        listenerRewardsUsd: 14.4,
      },
      3000,
    ),

    // --- Scene 8: Punchline — someone bids again, next ad starts ----------
    step(
      {
        type: "bid.placed",
        bidId: "bid_dogfood_2",
        brandId: "brand_dogfood",
        amountUsd: 22,
        slot: 2,
      },
      400,
      "Scene 8 — Dogfood bids $22",
    ),
    step(
      {
        type: "leaderboard.updated",
        ranking: [
          { brandId: "brand_dogfood", amountUsd: 22 },
          { brandId: "brand_coolstartup", amountUsd: 18 },
        ],
        nextSlotPriceUsd: 23,
      },
      2000,
    ),
    step(
      {
        type: "segment.generating",
        segmentId: "seg_393",
        slot: 2,
        tier: "video",
        brandId: "brand_dogfood",
      },
      4000,
    ),
  ],
};

// ---------------------------------------------------------------------------
// Expected answers — demo grading is fixture-driven.
// Maps the challenge(s) fired above to their scripted correct answer so the
// listener demo grading path is explicit instead of assuming the correct
// option sits at index 1. Challenges without a mapped answer verify by
// design — the demo never blocks the arc.
// ---------------------------------------------------------------------------

export const DEMO_CHALLENGE_ANSWERS: Record<string, string> = {
  chal_392_1: "Postgres",
};

export function expectedDemoAnswer(challengeId: string): string | undefined {
  return DEMO_CHALLENGE_ANSWERS[challengeId];
}
