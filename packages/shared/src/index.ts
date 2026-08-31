// Shared contract between all Slopstream lanes.
// Changes land here first; every lane updates together.
// See docs/hackathon/team-split.md — "The seams: contract-first on day 1".

// ---------------------------------------------------------------------------
// Production tiers
// ---------------------------------------------------------------------------

export type ProductionTier = "audio" | "audio_image" | "video" | "premium";

export const TIER_BID_THRESHOLDS_USD = {
  audio: { min: 1, max: 5 },
  audio_image: { min: 5, max: 20 },
  video: { min: 20, max: 50 },
  premium: { min: 50, max: null },
} as const;

// ---------------------------------------------------------------------------
// Attention challenges
// ---------------------------------------------------------------------------

export type ChallengeType =
  | "recall"
  | "audio"
  | "visual"
  | "completion"
  | "true_false"
  | "sequence"
  | "voice"
  | "image";

/**
 * Full challenge definition — backend-only. Includes the answer.
 * Never sent over WebSocket or to the client. Lane 2 stores this;
 * Lane 1 verifies listener responses against it.
 */
export interface Challenge {
  id: string;
  type: ChallengeType;
  question: string;
  /** Present for multiple-choice style challenges. */
  options?: string[];
  answer: string;
  segmentId: string;
  /** Seconds from segment start when the challenge becomes answerable. */
  validFrom: number;
  /** Seconds from segment start when the challenge expires. */
  validUntil: number;
  /** 1 (easiest) to 5 (hardest). Feeds reward weighting. */
  difficulty: 1 | 2 | 3 | 4 | 5;
}

/**
 * Public challenge — safe to broadcast. Omits the answer.
 * This is what travels over WebSocket in `challenge.fired` and what
 * the listener client renders. Lane 2 holds the full Challenge
 * server-side; the client never receives the answer.
 */
export interface PublicChallenge {
  id: string;
  type: ChallengeType;
  question: string;
  /** Present for multiple-choice style challenges. */
  options?: string[];
  segmentId: string;
  /** Seconds from segment start when the challenge becomes answerable. */
  validFrom: number;
  /** Seconds from segment start when the challenge expires. */
  validUntil: number;
  /** 1 (easiest) to 5 (hardest). Feeds reward weighting. */
  difficulty: 1 | 2 | 3 | 4 | 5;
}

// ---------------------------------------------------------------------------
// Attention proofs (Lane 1 boundary)
// ---------------------------------------------------------------------------

export interface AttentionProofSubmission {
  /** Privacy-preserving listener commitment; identity never leaves the client. */
  listenerCommitment: string;
  segmentId: string;
  challengeId: string;
  /**
   * Opaque proof payload verified by ProofOfAttention.
   *
   * IMPORTANT: replay resistance, challenge-timing binding, and session
   * binding are carried INSIDE this payload — they are NOT enforced by the
   * HTTPS API layer. Valid attention is the conjunction of correct answer +
   * valid session + challenge timing + segment binding + non-replayable proof
   * + anti-abuse checks (see docs/product/economics.md#the-critical-anti-gaming-layer).
   * Lane 2 persists and forwards this to Lane 1's verifier; neither treats a
   * well-formed submission as valid on its own.
   */
  resultProof: string;
}

export interface AttentionProofReceipt {
  proofId: string;
  segmentId: string;
  challengeId: string;
  brandId: string;
  challengeType: ChallengeType;
  verified: boolean;
  estimatedRewardUsd?: number;
  /** Which verifier implementation produced this receipt, so the UI can
   *  label stub vs Midnight receipts truthfully. */
  verifierMode?: "stub" | "midnight";
  createdAt: string;
}

/**
 * The backend-supplied facts required to verify a listener proof. The complete
 * `Challenge` (including its answer) stays in Lane 2's private store; only
 * timing and binding facts are sent to Lane 1's verifier.
 */
export interface AttentionProofVerificationContext {
  /** ISO-8601 timestamp when the segment began playback. */
  segmentStartedAt: string;
  /** ISO-8601 timestamp when the API received the submission. */
  submittedAt: string;
  challenge: Pick<Challenge, "id" | "segmentId" | "validFrom" | "validUntil">;
}

/**
 * Server-to-server request from Lane 2 to Lane 1's proof verifier.
 * Never expose this endpoint directly to browser clients: Lane 2 authenticates
 * the listener, owns the full Challenge, and persists the result.
 */
export interface AttentionProofVerificationRequest {
  submission: AttentionProofSubmission;
  context: AttentionProofVerificationContext;
}

export type AttentionProofVerificationFailure =
  | "invalid_request"
  | "malformed_proof"
  | "proof_marked_invalid"
  | "binding_mismatch"
  | "outside_challenge_window"
  | "replayed_proof"
  | "recording_failed";

/** Result returned by Lane 1's verifier to Lane 2. */
export interface AttentionProofVerificationResult {
  verified: boolean;
  /** Stable reference suitable for Lane 2's attention_events.proof_ref. */
  proofId?: string;
  /** Present only when `verified` is false. */
  failure?: AttentionProofVerificationFailure;
  /** Identifies the verifier implementation that produced this result. */
  verifierMode: "stub" | "midnight";
  verifiedAt: string;
}

/**
 * Demo-only payload encoded as JSON inside `AttentionProofSubmission.resultProof`.
 * It proves nothing cryptographically: `valid` is self-reported by the caller.
 * The JSON-stub verifier uses it only to exercise binding, timing, and replay
 * handling while the Compact implementation is unavailable. Never enable this
 * format for a production reward or clearing decision.
 */
export interface StubAttentionProofPayload {
  version: "slopstream.stub.attention.v1";
  listenerCommitment: string;
  segmentId: string;
  challengeId: string;
  /** Must be unique per proof; the stub verifier rejects a replay in memory. */
  nonce: string;
  /** ISO-8601 time at which the demo proof was generated. */
  issuedAt: string;
  /** Self-reported demo result — it is not a cryptographic claim. */
  valid: boolean;
}

/**
 * Inputs Lane 2 supplies only after it has privately graded the listener's
 * answer as correct. `nonce` must be fresh for every issued proof; the stub
 * verifier uses it for in-memory replay rejection.
 */
export interface ServerStubAttentionProofInput {
  listenerCommitment: string;
  segmentId: string;
  challengeId: string;
  nonce: string;
  issuedAt: string;
}

/**
 * Creates the JSON string assigned to AttentionProofSubmission.resultProof
 * for the hackathon's server-to-server stub flow. This is an attestation
 * format, not a cryptographic signature: call it only in Lane 2 after the
 * API has authenticated the session and checked the private challenge answer.
 */
export function createServerStubAttentionProof(
  input: ServerStubAttentionProofInput,
): string {
  return JSON.stringify({
    version: "slopstream.stub.attention.v1",
    ...input,
    valid: true,
  } satisfies StubAttentionProofPayload);
}

// ---------------------------------------------------------------------------
// Brands (Lane 2 boundary, consumed by Lane 3)
// ---------------------------------------------------------------------------

/**
 * Public brand identity + palette. The entire design language — the OUTBID
 * color wash, per-brand leaderboard chips, the listener screen tinting to
 * the brand color, the particle stream colors on clearing — depends on the
 * UI knowing each brand's name and colors. `LeaderboardEntry` and `Segment`
 * carry only `brandId`; clients resolve `brandId -> BrandSummary` via the
 * `brands` array on `StreamSnapshot`.
 *
 * For the hackathon, all demo brands are present in the initial snapshot, so
 * no live brand-discovery event is needed. If brands can appear mid-stream in
 * a later release, add a separately scoped event that carries a BrandSummary
 * rather than overloading an existing WsEvent (see team-split.md "seams").
 */
export interface BrandSummary {
  id: string;
  name: string;
  /** Primary brand color (CSS color string). Drives the background gradient
   *  and chip color while the brand's ad plays. */
  primaryColor: string;
  /** Secondary brand color for gradients / particle accents. */
  secondaryColor: string;
}

// ---------------------------------------------------------------------------
// Bids and clearing (Lane 2 boundary)
// ---------------------------------------------------------------------------

export type BidStatus =
  "pending" | "won" | "lost" | "cleared" | "uncleared" | "failed";

export interface Bid {
  id: string;
  brandId: string;
  amountUsd: number;
  /** The stream slot being contested — same name as the ledger column and event payloads. */
  slot: number;
  tier: ProductionTier;
  status: BidStatus;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Segments and the stream (Lane 3 boundary)
// ---------------------------------------------------------------------------

export type SegmentStatus =
  "queued" | "generating" | "ready" | "playing" | "done" | "failed";

export interface Segment {
  id: string;
  slot: number;
  /** null = free ad generated from scraped startup data. */
  brandId: string | null;
  /** Generated asset URL. Same field name as GenerationResult.assetUrl and
   *  the `segment.ready` event — one concept, one name across the seam. */
  assetUrl?: string;
  durationSeconds: number;
  /** The Continuum continuity input for the next generation. */
  summary: string;
  status: SegmentStatus;
  /** Cleared bid amount, set once the segment's attention window closed
   *  successfully. Absent for free segments and uncleared/failed bids. This
   *  is the durable price-of-attention history the big screen charts. */
  clearedAmountUsd?: number;
  /** Timestamp of the successful clearing evaluation. This is the canonical
   *  price-history timestamp; it is distinct from playback start. */
  clearedAtMs?: number;
  /** Timestamp of when the segment's attention window opened (playback
   *  start). Used to enforce the recent-segment age cap. */
  windowOpenedAtMs?: number;
}

// ---------------------------------------------------------------------------
// Reward pools
// ---------------------------------------------------------------------------

export type RewardPoolStatus = "pending" | "open" | "distributed" | "closed";

export interface RewardPool {
  id: string;
  bidId: string;
  grossAmountUsd: number;
  /** e.g. 0.8 */
  listenerPercentage: number;
  /** e.g. 0.2 */
  platformPercentage: number;
  /** gross * listenerPercentage */
  eligibleAmountUsd: number;
  distributedAmountUsd: number;
  status: RewardPoolStatus;
}

// ---------------------------------------------------------------------------
// WebSocket events (orchestrator/API → every screen)
// Event names and semantics mirror docs/technical/backend.md —
// "Live event contract" / "Public event reference". Payloads carry only
// aggregate/public data; no listener identity or answers cross the wire.
// ---------------------------------------------------------------------------

export type GenerationStage = "script" | "voice" | "image" | "video";

export interface LeaderboardEntry {
  brandId: string;
  amountUsd: number;
}

export type WsEvent =
  | {
      type: "auction.opened";
      slot: number;
      closesAt: string;
      nextSlotPriceUsd: number;
    }
  | {
      type: "bid.placed";
      bidId: string;
      brandId: string;
      amountUsd: number;
      slot: number;
    }
  | {
      type: "bid.outbid";
      slot: number;
      /** The bid that was standing and is now displaced (transitions to lost). */
      displacedBidId: string;
      displacedBrandId: string;
      /** The new standing bid that overtook it. */
      newBidId: string;
      newBrandId: string;
      /** The displaced standing amount. */
      prevAmountUsd: number;
      /** The amount that overtook it. */
      newAmountUsd: number;
    }
  | {
      type: "leaderboard.updated";
      ranking: LeaderboardEntry[];
      nextSlotPriceUsd: number;
    }
  | {
      type: "segment.generating";
      segmentId: string;
      slot: number;
      tier: ProductionTier;
      brandId: string;
    }
  | {
      type: "generation.progress";
      slot: number;
      stage: GenerationStage;
      done: boolean;
    }
  | {
      type: "segment.ready";
      segmentId: string;
      assetUrl: string;
      durationSec: number;
    }
  | {
      type: "segment.playing";
      segmentId: string;
      brandId: string;
      startedAt: string;
      /** ISO timestamp of when the attention window opened (playback start).
       *  Not sent in the public event payload; used here so the client can
       *  stamp the segment it builds from a playing event. */
      windowOpenedAtMs?: string;
    }
  | {
      /** Orchestrator-only replay of a previously aired segment to cover dead
       *  air. Carries the full playable payload because the API snapshot never
       *  reports encores and segment.playing has no assetUrl. No clearing
       *  window, challenges, or rewards attach to an encore. */
      type: "segment.encore";
      segmentId: string;
      brandId: string;
      startedAt: string;
      slot: number;
      assetUrl: string;
      durationSec: number;
      summary: string;
      /** ISO timestamp of when the attention window opened (playback start).
       *  Not sent in the public event payload; used here so the client can
       *  stamp the segment it builds from an encore event. */
      windowOpenedAtMs?: string;
    }
  | { type: "challenge.fired"; challenge: PublicChallenge }
  | {
      type: "attention.verified";
      segmentId: string;
      verifiedCount: number;
      /** Number of listeners currently in the segment's attention window. */
      total: number;
      /** Verified-count required for the segment's bid to clear. The big
       *  screen's liquid-threshold fill glows when verifiedCount >= threshold;
       *  without this the UI cannot render the clearing moment. */
      threshold: number;
    }
  | {
      type: "bid.cleared";
      bidId: string;
      segmentId: string;
      grossAmountUsd: number;
      listenerPoolUsd: number;
      platformRevenueUsd: number;
      /** Public, factual explanation of the winning bid's value exchange. */
      explanation?: string;
    }
  | {
      type: "bid.uncleared";
      bidId: string;
      segmentId: string;
      returnedAmountUsd: number;
    }
  | {
      /** Generation failed before playback; the reservation is returned.
       *  Distinct from `bid.uncleared` (threshold missed after playback). */
      type: "bid.failed";
      bidId: string;
      segmentId: string;
      returnedAmountUsd: number;
    }
  | {
      type: "reward.pool.updated";
      poolId: string;
      bidId: string;
      eligibleAmountUsd: number;
      distributedAmountUsd: number;
    }
  | {
      type: "stats.updated";
      listeners: number;
      attentionProofs: number;
      listenerRewardsUsd: number;
    };

/**
 * Gateway transport envelope. Wraps every public event delivered over
 * WebSocket. Clients use eventId to deduplicate and sequence to detect
 * gaps; on a gap or reconnect they reload GET /stream/snapshot.
 */
export interface WsDelivery {
  eventId: string;
  /** Monotonically increasing per stream. */
  sequence: number;
  event: WsEvent;
}

/**
 * Authoritative response of GET /stream/snapshot — initial load and
 * recovery after a missed event or reconnect.
 */
export interface ClearedBidSettlement {
  bidId: string;
  segmentId: string;
  grossAmountUsd: number;
  listenerPoolUsd: number;
  platformRevenueUsd: number;
  /** Public, factual explanation of the completed value exchange. */
  explanation: string;
  /** ISO timestamp of the clearing evaluation. */
  clearedAt: string;
}

export interface StreamSnapshot {
  asOfSequence: number;
  nowPlaying: Segment | null;
  /** Most recently completed segments, newest first. This is the durable
   *  visual history used by the big-screen Continuum after refresh/reconnect.
   *  Age-capped at most 30 minutes old (by segment.windowOpenedAtMs); older
   *  segments roll off so the UI only keeps the window that still matters. */
  recentSegments: Segment[];
  /** Latest public cleared-bid settlement. Allows reconnecting clients to
   *  retain the value-exchange explanation after replacing live state. */
  latestClearedBid?: ClearedBidSettlement;
  /** Segments that are generated/ready but not yet playing — the upcoming
   *  queue. Surfaces what's about to air so the screen can show "next up". */
  upcomingSegments: Segment[];
  /** ISO timestamp of when `nowPlaying` started. Lets a reconnecting client
   *  sync challenge validFrom/validUntil windows to elapsed playback time. */
  nowPlayingStartedAt?: string;
  /** Verified-count required for `nowPlaying`'s bid to clear. Drives the
   *  liquid-threshold fill before any attention.verified events arrive. */
  nowPlayingAttentionThreshold?: number;
  /** All brands currently in the market. Clients resolve `brandId` against
   *  this to render names + per-brand color palettes (see BrandSummary). */
  brands: BrandSummary[];
  leaderboard: LeaderboardEntry[];
  nextSlotPriceUsd: number;
  /** The open auction for the upcoming slot, if any. `closesAt` is the
   *  server-authoritative deadline that drives the brand console's
   *  "slot closes in 23s" countdown; it does not change when bids arrive. */
  currentAuction?: { slot: number; closesAt: string };
  listeners: number;
  attentionProofs: number;
  listenerRewardsUsd: number;
  /** The challenge currently answerable, if any. Never includes the answer. */
  activeChallenge?: PublicChallenge;
  /** Cumulative gross bid amount submitted across all slots. */
  placedVolumeUsd?: number;
  /** Cumulative gross amount whose attention windows cleared successfully. */
  totalClearedVolumeUsd?: number;
}

// ---------------------------------------------------------------------------
// Generation interface (Lane 1 boundary)
// ---------------------------------------------------------------------------

/** Live market snapshot passed into generation for tone-aware scripts. */
export interface GenerationMarketContext {
  leaderBrandId?: string;
  leaderAmountUsd?: number;
  openSlot?: number;
  nextSlotPriceUsd?: number;
  verifiedCount?: number;
  attentionThreshold?: number;
  /** 0–1 progress toward clearing the on-air attention threshold. */
  attentionProgress?: number;
}

export interface GenerationRequest {
  /**
   * Canonical ID allocated by Lane 2 when an auction winner realizes a
   * segment. The generator must echo this ID in GenerationResult; it must
   * never mint a competing stream segment ID.
   */
  segmentId: string;
  /** null = free ad generated from a scraped company. */
  brandId: string | null;
  brief: string;
  tier: ProductionTier;
  /** Summaries of the previous 1–2 segments — The Continuum continuity input. */
  previousSummaries: string[];
  constraints?: string;
  /** Hero frame from the prior segment — image-first continuity for video. */
  continuityImageUrl?: string;
  /** Optional auction/attention context for market-aware scripts. */
  marketContext?: GenerationMarketContext;
  /**
   * Scraped company's page URL for free segments. The generator fetches its
   * OG image for visual grounding; never present for paid-brand segments.
   */
  sourceUrl?: string;
}

/** Orchestrator ops snapshot for the stream HUD and alerting (GET /ops/metrics). */
export interface StreamOpsMetrics {
  asOf: string;
  segmentPlaySec: number;
  generation: {
    inFlight: boolean;
    lastDurationMs?: number;
    lastSegmentId?: string;
    /** True when playback may run dry before the next segment is ready. */
    atRisk: boolean;
    /** Smoothed generation duration driving the adaptive prefetch depth. */
    ewmaDurationMs?: number;
    prefetchDepth?: number;
  };
  playback: {
    active: boolean;
    segmentId?: string;
    elapsedSec?: number;
    remainingSec?: number;
  };
  /** Dead-air replays — orchestrator-only, outside the clearing ledger. */
  encore?: {
    active: boolean;
    totalPlays: number;
    lastSegmentId?: string;
  };
  queue: {
    nowPlayingStatus?: string;
    /** False when the API snapshot needed for queue-derived metrics failed.
     *  `upcomingCount` is then unavailable for alerting decisions. */
    snapshotAvailable: boolean;
    upcomingCount: number;
    processedSegments: number;
  };
  market: {
    leaderBrandId?: string;
    leaderAmountUsd?: number;
    openSlot?: number;
    nextSlotPriceUsd?: number;
  };
}

export interface GenerationResult {
  segmentId: string;
  assetUrl: string;
  durationSec: number;
  /** Feeds Lane 2's challenge engine. */
  transcript: string;
  /** The Continuum continuity input for the next generation. */
  summary: string;
  visualMetadata?: Record<string, unknown>;
  audioMetadata?: Record<string, unknown>;
}

export type ScrapedCompanySource =
  "hacker_news" | "product_hunt" | "yc_launch" | "news";

export interface ScrapedCompany {
  id: string;
  name: string;
  source: ScrapedCompanySource;
  sourceUrl: string;
  tagline?: string;
  description?: string;
  scrapedAt: string;
  claimed: boolean;
  /** Set once the company has been turned into a free stream segment. */
  usedAt?: string;
  /** Set when the company has opted out of being featured. */
  optedOut?: boolean;
}

/** One scraped-company submission to POST /companies/scraped. */
export interface ScrapedCompanySubmission {
  name: string;
  source: ScrapedCompanySource;
  sourceUrl: string;
  tagline?: string;
  description?: string;
}

export interface TakedownCommand {
  sourceUrl: string;
}

export interface TakedownResult {
  found: boolean;
  optedOut: boolean;
}

/** POST /companies/scraped (orchestrator bearer). */
export interface IngestScrapedCompaniesCommand {
  companies: ScrapedCompanySubmission[];
}

/**
 * Pseudo-brand that represents free (scraped-company) filler segments in the
 * marketplace UI. Free segments have `brandId = null` in the ledger but carry
 * this id in public events so clients can resolve a palette from
 * `snapshot.brands`. It never appears on the leaderboard (no bids).
 */
export const FREE_BRAND_ID = "brand_free_slopstream";
export const FREE_BRAND_SUMMARY: BrandSummary = {
  id: FREE_BRAND_ID,
  name: "FREE SLOP",
  primaryColor: "#7de3d8",
  secondaryColor: "#b8a9f5",
};

// ---------------------------------------------------------------------------
// Listener sessions
// ---------------------------------------------------------------------------

/** Minimum internal balance required before a listener can request a payout. */
export const LISTENER_PAYOUT_MINIMUM_USD = 1;

export interface ListenerSession {
  id: string;
  joinedAt: string;
  /** Cleared rewards minus completed payouts. */
  availableBalanceUsd: number;
  /** Estimated share for verified proofs on segments still in play. */
  pendingBalanceUsd: number;
  todayVerifiedUsd: number;
}

/** POST /listener-sessions/me/payout-request — cash out available balance. */
export interface PayoutRequestCommand {
  /** Omit to withdraw the full available balance. */
  amountUsd?: number;
}

/** Response from the stub payout rail (demo / hackathon). */
export interface PayoutReceipt {
  payoutId: string;
  amountUsd: number;
  status: "completed";
  createdAt: string;
}

/** GET /listener-sessions/me/payouts — newest completed payouts first. */
export interface PayoutHistoryResponse {
  payouts: PayoutReceipt[];
}

// ---------------------------------------------------------------------------
// Demo fixture (Lane 3 owns the player; Lanes 1–2 supply canned data)
// ---------------------------------------------------------------------------

/**
 * A single scripted step in a demo fixture. The player renders `snapshot`
 * (if present) as authoritative state, then applies `delivery`, then waits
 * `delayMsAfter` before the next step. A step carries a delivery, a snapshot,
 * or both (a snapshot-only step is a hard state reset — e.g. scene boundary).
 */
export interface DemoStep {
  /** The public event to project, wrapped in its transport envelope. */
  delivery?: WsDelivery;
  /** Authoritative state to seed/reset before applying `delivery`. */
  snapshot?: StreamSnapshot;
  /** Optional human-readable label for the step (e.g. "Scene 3 — Outbid"). */
  label?: string;
  /** Milliseconds to wait after this step before advancing. Default 0. */
  delayMsAfter?: number;
}

/**
 * A versioned, fixture-driven demo sequence — the on-stage insurance policy.
 * Drives the entire UI (big screen, listener, brand console) with no live API,
 * generator, or contracts. Lane 3 owns the player; Lanes 1–2 supply the canned
 * proof/clearing data inside the steps. See
 * docs/hackathon/team-split.md — "Day 1 contract-freeze checklist".
 *
 * The player is a pure function of this fixture: identical `version` + `steps`
 * must produce an identical run, so the sequence is deterministic and
 * replayable across rehearsals.
 */
export interface DemoFixture {
  /** Bump when the step shape or sequence changes; players pin a version. */
  version: number;
  /** Stable identifier, e.g. "hackathon-main". */
  id: string;
  /** Optional description of what this fixture demonstrates. */
  description?: string;
  /** The initial authoritative state before any step runs. */
  initialSnapshot: StreamSnapshot;
  /** Ordered steps replayed by the demo player. */
  steps: DemoStep[];
}

// ---------------------------------------------------------------------------
// Live transport topics (frozen by the day-1 contract-freeze checklist)
// ---------------------------------------------------------------------------

/**
 * Redis pub/sub channel names. Lane 2 publishes persisted marketplace events
 * on `marketplace`; Lane 3's gateway subscribes there and fans them out over
 * WebSocket, and publishes orchestrator-runtime events on `runtime`.
 * Every message on both channels is a JSON-encoded `WsDelivery`.
 */
export const REDIS_TOPICS = {
  marketplace: "slopstream:marketplace",
  runtime: "slopstream:runtime",
} as const;

// ---------------------------------------------------------------------------
// Auction reads (Lane 2 boundary, consumed by the orchestrator)
// ---------------------------------------------------------------------------

export type AuctionStatus = "open" | "closed";

/**
 * Read shape of one slot auction. The orchestrator consumes auction results
 * through this (GET /auctions/current, GET /auctions/:slot) — it never
 * resolves auctions itself.
 */
export interface AuctionState {
  slot: number;
  status: AuctionStatus;
  /** Server-authoritative deadline; drives the brand console countdown. */
  closesAt: string;
  /** Minimum acceptable bid right now (opening price or standing + increment). */
  nextSlotPriceUsd: number;
  /** Current standing bid, if any. */
  standing?: {
    bidId: string;
    brandId: string;
    amountUsd: number;
    tier: ProductionTier;
  };
  /** Present once the auction closed with a winner. */
  winner?: {
    bidId: string;
    brandId: string;
    amountUsd: number;
    tier: ProductionTier;
    /** The campaign brief the generator receives. */
    brief: string;
    /** The queued segment realizing this slot — the orchestrator drives its
     *  lifecycle (generating/ready/playing/window-closed) against this id. */
    segmentId: string;
    /** Persisted lifecycle state used by a restarting orchestrator. */
    segmentStatus?: SegmentStatus;
  };
  /**
   * Present once the auction closed with NO winner and a scraped company was
   * consumed for a free filler ad. The orchestrator drives the segment
   * lifecycle exactly like a winner's segment, but no money moves and no
   * reward pool exists (docs/product/content.md — cold-start engine).
   */
  freeSegment?: {
    segmentId: string;
    /** The scraped company the ad is generated for. */
    companyName: string;
    /** The generation brief built from the scraped data. */
    brief: string;
    tier: ProductionTier;
    segmentStatus?: SegmentStatus;
    /** The scraped company's page URL — visual-grounding input for Lane 1. */
    sourceUrl?: string;
  };
}

// ---------------------------------------------------------------------------
// HTTPS command bodies (Lane 2 API)
// ---------------------------------------------------------------------------

/** POST /brands */
export interface CreateBrandCommand {
  name: string;
  /** CSS color strings — drive the per-brand palette everywhere. */
  primaryColor: string;
  secondaryColor: string;
  /** Campaign brief fed to the generation pipeline when this brand wins. */
  brief: string;
}

/** POST /top-ups — mock-Stripe for the hackathon; credits immediately. */
export interface TopUpCommand {
  brandId: string;
  amountUsd: number;
}

/** POST /bids — amount must exceed the standing bid by at least the increment. */
export interface PlaceBidCommand {
  brandId: string;
  amountUsd: number;
  /** Idempotency key: repeated POSTs with the same key for the same brand +
   *  amount are no-ops (return the existing bid). Protects against double-
   *  charges on retry / network flakiness. */
  idempotencyKey?: string;
}

/** POST /segments/:segmentId/challenge-source — feeds the challenge engine. */
export interface ChallengeSourceCommand {
  segmentId: string;
  durationSec: number;
  transcript: string;
  visualMetadata?: Record<string, unknown>;
  audioMetadata?: Record<string, unknown>;
}
