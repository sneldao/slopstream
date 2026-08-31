// Lane 2 HTTPS command + snapshot surface (docs/technical/backend.md —
// "Commands and snapshots use HTTPS"). The orchestrator-facing segment
// lifecycle endpoints are the one Lane 3 → Lane 2 dependency; every shape here
// that crosses lanes mirrors packages/shared.

import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { timingSafeEqual } from "node:crypto";
import type {
  AttentionProofSubmission,
  Bid,
  ChallengeSourceCommand,
  CreateBrandCommand,
  IngestScrapedCompaniesCommand,
  PlaceBidCommand,
  ProductionTier,
  TakedownCommand,
  TopUpCommand,
} from "@slopstream/shared";
import type { AuctionEngine } from "./auction.js";
import type { ClearingEngine } from "./clearing.js";
import { generateChallenges, nextUnfired, toPublic } from "./challenges.js";
import type { EventBus } from "./bus.js";
import type { BidRow, BrandRow, Ledger, ListenerSessionRow } from "./ledger.js";
import type { MarketService } from "./market.js";
import { toBalanceView, toBrandSummary, toListenerSession } from "./market.js";
import { ApiError, assert, centsToUsd } from "./money.js";
import { composeSnapshot } from "./snapshot.js";
import type { StripeService } from "./stripe.js";
import { BidProtection } from "./bidProtection.js";
import { priceHistoryCsv, priceHistoryFromSegments } from "./priceHistory.js";

export interface ApiDeps {
  ledger: Ledger;
  bus: EventBus;
  auction: AuctionEngine;
  clearing: ClearingEngine;
  market: MarketService;
  /** Grace after playback end before the clearing evaluation runs. */
  windowGraceSec: number;
  /** Shared bearer credential for orchestrator-only lifecycle commands. */
  orchestratorApiToken: string;
  /** Bearer token required to create a brand via POST /brands. */
  brandCreatorToken: string;
  /** Stripe service (undefined when in mock mode). */
  stripeService?: StripeService;
  /**
   * Publish segment.* / challenge.fired from the lifecycle endpoints.
   * Defaults to true; set false when the Lane 3 orchestrator emits those
   * events itself — exactly one emitter per WsEvent.
   */
  publishLifecycleEvents?: boolean;
}

type Handler = (req: Request, res: Response) => void | Promise<void>;

/** Forward async rejections to the error middleware. */
function wrap(
  handler: Handler,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}
function errHandler(err: unknown, _req: Request, res: Response): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const status =
    typeof (err as { status?: unknown })?.status === "number"
      ? (err as { status: number }).status
      : 500;
  res.status(status).json({
    error:
      status >= 500 ? "internal error" : String((err as Error).message ?? err),
  });
}

function bearerToken(req: Request): string | undefined {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : undefined;
}

function tokensEqual(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireOrchestrator(expectedToken: string, req: Request): void {
  const token = bearerToken(req);
  assert(token, 401, "missing orchestrator bearer token");
  assert(
    tokensEqual(token, expectedToken),
    403,
    "invalid orchestrator bearer token",
  );
}

function requireBrandCreator(expectedToken: string, req: Request): void {
  const token = bearerToken(req);
  assert(token, 401, "missing brand creator bearer token");
  assert(
    tokensEqual(token, expectedToken),
    403,
    "invalid brand creator bearer token",
  );
}

function requireBrand(ledger: Ledger, req: Request): BrandRow {
  const token = bearerToken(req);
  assert(token, 401, "missing bearer token");
  const brand = ledger.brandByToken(token);
  assert(brand, 403, "unknown brand token");
  return brand;
}

function requireListener(ledger: Ledger, req: Request): ListenerSessionRow {
  const token = bearerToken(req);
  assert(token, 401, "missing bearer token");
  const session = ledger.listenerByToken(token);
  assert(session, 403, "unknown listener token");
  session.lastSeenAtMs = Date.now();
  return session;
}

function toSharedBid(bid: BidRow): Bid {
  return {
    id: bid.id,
    brandId: bid.brandId,
    amountUsd: centsToUsd(bid.amountCents),
    slot: bid.slot,
    tier: bid.tier,
    status: bid.status,
    createdAt: bid.createdAt,
  };
}

export function createRouter(deps: ApiDeps): Router {
  const {
    ledger,
    bus,
    auction,
    clearing,
    market,
    windowGraceSec,
    orchestratorApiToken,
    brandCreatorToken,
    stripeService,
  } = deps;
  const publishLifecycleEvents = deps.publishLifecycleEvents ?? true;
  const router = Router();
  const bidProtection = new BidProtection();
  // Deferred grace-period closes, keyed by segmentId, so /failed can cancel.
  const pendingCloses = new Map<string, NodeJS.Timeout>();

  // ------------------------------------------------------------------ health
  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "slopstream-api", sequence: bus.sequence });
  });

  // --------------------------------------------------- scraped companies

  // Cold-start ingestion (docs/product/content.md). The orchestrator's
  // Parallel-powered scraper discovers newly launched companies and posts
  // them here; the auction engine consumes them for free filler segments.
  router.post(
    "/companies/scraped",
    wrap((req, res) => {
      requireOrchestrator(orchestratorApiToken, req);
      const body = req.body as IngestScrapedCompaniesCommand;
      assert(
        Array.isArray(body?.companies),
        400,
        "companies array is required",
      );
      assert(
        body.companies.length > 0 && body.companies.length <= 100,
        400,
        "companies must contain 1–100 entries",
      );
      const result = ledger.insertScrapedCompanies(body.companies);
      res.status(201).json(result);
    }),
  );

  router.get(
    "/companies/scraped",
    wrap((req, res) => {
      requireOrchestrator(orchestratorApiToken, req);
      const unused = [...ledger.scrapedCompanies.values()]
        .filter((c) => c.usedAtMs === undefined && !c.optedOut)
        .sort((a, b) => a.scrapedAt.localeCompare(b.scrapedAt));
      res.json({ companies: unused });
    }),
  );

  // Public takedown endpoint — anyone can request a company opt-out.
  router.post(
    "/companies/takedown",
    wrap((req, res) => {
      const body = req.body as TakedownCommand;
      assert(
        typeof body?.sourceUrl === "string" && body.sourceUrl.length > 0,
        400,
        "sourceUrl is required",
      );
      const result = ledger.markOptedOut(body.sourceUrl);
      res.json(result);
    }),
  );

  // ------------------------------------------------------------------ brands
  router.post(
    "/brands",
    wrap((req, res) => {
      requireBrandCreator(brandCreatorToken, req);
      const { brand, token } = market.createBrand(
        req.body as CreateBrandCommand,
      );
      res.status(201).json({
        token,
        brand: toBrandSummary(brand),
        brief: brand.brief,
        balance: toBalanceView(ledger.balances.get(brand.id)!),
      });
    }),
  );

  router.get(
    "/brands/me/balance",
    wrap((req, res) => {
      const brand = requireBrand(ledger, req);
      res.json({
        brand: toBrandSummary(brand),
        brief: brand.brief,
        balance: toBalanceView(ledger.balances.get(brand.id)!),
      });
    }),
  );

  router.post(
    "/top-ups",
    wrap(async (req, res) => {
      const brand = requireBrand(ledger, req);
      const cmd = req.body as TopUpCommand;
      assert(
        cmd?.brandId === brand.id,
        403,
        "top-up brandId must match the bearer brand",
      );
      if (stripeService) {
        const session = await stripeService.createCheckoutSession(
          brand.id,
          cmd.amountUsd,
        );
        res.status(201).json(session);
      } else {
        res.status(201).json(market.topUp(cmd));
      }
    }),
  );

  // ------------------------------------------------------------------- bids
  router.post(
    "/bids",
    wrap((req, res) => {
      const brand = requireBrand(ledger, req);
      const cmd = req.body as PlaceBidCommand;
      assert(
        cmd && typeof cmd.amountUsd === "number",
        400,
        "amountUsd is required",
      );
      assert(
        cmd.brandId === undefined || cmd.brandId === brand.id,
        403,
        "brandId must match the bearer brand",
      );
      const idempotencyKey =
        req.header("idempotency-key")?.trim() || cmd.idempotencyKey?.trim();
      const amountCents = Math.round(cmd.amountUsd * 100);
      assert(
        Number.isFinite(amountCents) && amountCents > 0,
        400,
        "amountUsd must be positive",
      );
      if (idempotencyKey) {
        const replay = bidProtection.replay(
          brand.id,
          idempotencyKey,
          amountCents,
        );
        if (replay) {
          res.status(200).json({
            bid: toSharedBid(replay),
            balance: toBalanceView(ledger.balances.get(brand.id)!),
            idempotentReplay: true,
          });
          return;
        }
      }
      bidProtection.checkRate(brand.id);
      const { bid, outbid } = auction.placeBid(brand, cmd.amountUsd);
      if (idempotencyKey) {
        bidProtection.record(brand.id, idempotencyKey, amountCents, bid);
      }
      res.status(201).json({
        bid: toSharedBid(bid),
        outbid: outbid
          ? { bidId: outbid.id, brandId: outbid.brandId }
          : undefined,
        balance: toBalanceView(ledger.balances.get(brand.id)!),
      });
    }),
  );

  // -------------------------------------------------------- listener sessions
  router.post(
    "/listener-sessions",
    wrap((req, res) => {
      const body = req.body as { listenerCommitment?: unknown } | undefined;
      const commitment = body?.listenerCommitment;
      assert(
        commitment === undefined ||
          (typeof commitment === "string" && commitment.length > 0),
        400,
        "listenerCommitment must be a non-empty string",
      );
      const token = bearerToken(req);
      const resumed = token ? ledger.listenerByToken(token) : undefined;
      if (token) assert(resumed, 403, "unknown listener token");
      const {
        session,
        token: sessionToken,
        resumed: didResume,
      } = market.createListenerSession(resumed, commitment);
      res.status(didResume ? 200 : 201).json({
        token: sessionToken,
        session: toListenerSession(session, ledger),
      });
    }),
  );

  router.get(
    "/listener-sessions/me",
    wrap((req, res) => {
      const session = requireListener(ledger, req);
      res.json({ session: toListenerSession(session, ledger) });
    }),
  );

  router.get(
    "/listener-sessions/me/payouts",
    wrap((req, res) => {
      const session = requireListener(ledger, req);
      res.json({ payouts: market.listPayouts(session.id) });
    }),
  );

  router.post(
    "/listener-sessions/me/payout-request",
    wrap((req, res) => {
      const session = requireListener(ledger, req);
      const body = req.body as { amountUsd?: unknown } | undefined;
      const amountUsd =
        body?.amountUsd === undefined ? undefined : Number(body.amountUsd);
      assert(
        amountUsd === undefined ||
          (Number.isFinite(amountUsd) && amountUsd > 0),
        400,
        "amountUsd must be a positive number",
      );
      const receipt = market.requestPayout(session, amountUsd);
      res.status(201).json({
        receipt,
        session: toListenerSession(session, ledger),
      });
    }),
  );

  // --------------------------------------------------------- attention proofs
  router.post(
    "/attention-proofs",
    wrap(async (req, res) => {
      const session = requireListener(ledger, req);
      const body = req.body as AttentionProofSubmission;
      assert(
        body && typeof body.challengeId === "string",
        400,
        "challengeId is required",
      );
      assert(
        body && typeof body.segmentId === "string",
        400,
        "segmentId is required",
      );
      assert(
        body && typeof body.resultProof === "string",
        400,
        "resultProof is required",
      );
      assert(
        body && typeof body.listenerCommitment === "string",
        400,
        "listenerCommitment is required",
      );
      assert(
        body.listenerCommitment === session.commitment,
        403,
        "listenerCommitment must match the bearer session",
      );
      // The receipt IS the response body — the shared AttentionProofReceipt
      // shape, exactly what the listener client casts it to.
      const receipt = await clearing.submitProof(session, body);
      res.status(201).json(receipt);
    }),
  );

  // --------------------------- orchestrator-facing segment lifecycle (Lane 3)
  // These endpoints persist state AND (with publishLifecycleEvents on) publish
  // the corresponding runtime events so the live flow works before Lane 3's
  // orchestrator exists. With the flag off the orchestrator emits
  // segment.*/challenge.fired itself — exactly one emitter per WsEvent.
  function requireSegment(req: Request) {
    const segmentId = String(req.params.segmentId);
    const segment = ledger.segments.get(segmentId);
    assert(segment, 404, `unknown segment ${segmentId}`);
    return segment;
  }

  router.post(
    "/segments/:segmentId/generating",
    wrap((req, res) => {
      requireOrchestrator(orchestratorApiToken, req);
      const segment = requireSegment(req);
      assert(
        segment.status === "queued" || segment.status === "generating",
        409,
        `segment cannot generate from ${segment.status}`,
      );
      const changed = segment.status !== "generating";
      segment.status = "generating";
      const tier: ProductionTier =
        (segment.bidId ? ledger.bids.get(segment.bidId)?.tier : undefined) ??
        "audio_image";
      if (publishLifecycleEvents && changed) {
        bus.publish({
          type: "segment.generating",
          segmentId: segment.id,
          slot: segment.slot,
          tier,
          brandId: segment.brandId ?? "",
        });
      }
      res.json({ segmentId: segment.id, status: segment.status });
    }),
  );

  router.post(
    "/segments/:segmentId/ready",
    wrap((req, res) => {
      requireOrchestrator(orchestratorApiToken, req);
      const segment = requireSegment(req);
      const body = req.body as {
        assetUrl?: string;
        durationSec?: number;
        summary?: string;
      };
      assert(
        typeof body?.assetUrl === "string" && body.assetUrl.length > 0,
        400,
        "assetUrl is required",
      );
      if (segment.status === "ready") {
        assert(
          segment.mediaUrl === body.assetUrl &&
            (body.summary === undefined || segment.summary === body.summary),
          409,
          "conflicting ready retry",
        );
        res.json({
          segmentId: segment.id,
          status: segment.status,
          assetUrl: segment.mediaUrl,
        });
        return;
      }
      assert(
        segment.status === "generating",
        409,
        `segment cannot become ready from ${segment.status}`,
      );
      segment.mediaUrl = body.assetUrl;
      if (typeof body.durationSec === "number" && body.durationSec > 0) {
        segment.durationSec = Math.round(body.durationSec);
      }
      if (typeof body.summary === "string") segment.summary = body.summary;
      segment.status = "ready";
      if (publishLifecycleEvents) {
        bus.publish({
          type: "segment.ready",
          segmentId: segment.id,
          assetUrl: segment.mediaUrl!,
          durationSec: segment.durationSec,
        });
      }
      res.json({
        segmentId: segment.id,
        status: segment.status,
        assetUrl: segment.mediaUrl,
      });
    }),
  );

  router.post(
    "/segments/:segmentId/challenge-source",
    wrap((req, res) => {
      requireOrchestrator(orchestratorApiToken, req);
      const segment = requireSegment(req);
      assert(
        segment.status === "ready",
        409,
        `challenge source cannot be added from ${segment.status}`,
      );
      const body = req.body as Omit<ChallengeSourceCommand, "segmentId">;
      assert(
        typeof body?.transcript === "string" && body.transcript.length > 0,
        400,
        "transcript is required",
      );
      const existing = ledger.challengesForSegment(segment.id);
      if (existing.length > 0) {
        res.status(200).json({
          segmentId: segment.id,
          generated: existing.length,
          replayed: true,
        });
        return;
      }
      assert(
        typeof body?.durationSec === "number" && body.durationSec > 0,
        400,
        "durationSec is required",
      );
      const challenges = generateChallenges(ledger, {
        segmentId: segment.id,
        durationSec: body.durationSec,
        transcript: body.transcript,
        visualMetadata: body.visualMetadata,
        audioMetadata: body.audioMetadata,
      });
      res
        .status(201)
        .json({ segmentId: segment.id, generated: challenges.length });
    }),
  );

  // Lane 3 pulls the next challenge when its scheduler decides to fire one.
  router.post(
    "/segments/:segmentId/challenges/next",
    wrap((req, res) => {
      requireOrchestrator(orchestratorApiToken, req);
      const segment = requireSegment(req);
      assert(segment.status === "playing", 409, "segment is not playing");
      const challenge = nextUnfired(ledger, segment.id);
      assert(challenge, 404, "no unfired challenges remain for this segment");
      challenge.firedAtMs = Date.now();
      const publicChallenge = toPublic(challenge);
      if (publishLifecycleEvents) {
        bus.publish({ type: "challenge.fired", challenge: publicChallenge });
      }
      res.json({ challenge: publicChallenge });
    }),
  );

  // Playback start opens the attention window and freezes the threshold.
  router.post(
    "/segments/:segmentId/playing",
    wrap((req, res) => {
      requireOrchestrator(orchestratorApiToken, req);
      const segment = requireSegment(req);
      const changed = segment.status !== "playing";
      const opened = clearing.openWindow(segment.id, Date.now());
      const startedAt = new Date(opened.windowOpenedAtMs!).toISOString();
      if (publishLifecycleEvents && changed) {
        bus.publish({
          type: "segment.playing",
          segmentId: opened.id,
          brandId: segment.brandId ?? "",
          startedAt,
        });
      }
      res.json({
        segmentId: opened.id,
        startedAt,
        attentionThreshold: opened.requiredEvents,
      });
    }),
  );

  // Playback end triggers clearing after the grace period for in-flight
  // submissions (docs/technical/backend.md — "Window close"); evaluation
  // still runs exactly once.
  router.post(
    "/segments/:segmentId/window-closed",
    wrap((req, res) => {
      requireOrchestrator(orchestratorApiToken, req);
      const segment = requireSegment(req);
      if (segment.windowClosed) {
        res.json({
          segmentId: segment.id,
          ...clearing.closeWindow(segment.id),
        });
        return;
      }
      if (segment.windowClosingAtMs !== undefined) {
        res.json({
          segmentId: segment.id,
          closing: true,
          graceSec: Math.max(
            (segment.windowClosingAtMs - Date.now()) / 1000,
            0,
          ),
          replayed: true,
        });
        return;
      }
      if (windowGraceSec <= 0) {
        res.json({
          segmentId: segment.id,
          ...clearing.closeWindow(segment.id),
        });
        return;
      }
      segment.windowClosingAtMs = Date.now() + windowGraceSec * 1000;
      pendingCloses.set(
        segment.id,
        setTimeout(() => {
          pendingCloses.delete(segment.id);
          if (!segment.windowClosed) clearing.closeWindow(segment.id);
        }, windowGraceSec * 1000),
      );
      res.json({
        segmentId: segment.id,
        closing: true,
        graceSec: windowGraceSec,
      });
    }),
  );

  router.post(
    "/segments/:segmentId/failed",
    wrap((req, res) => {
      requireOrchestrator(orchestratorApiToken, req);
      const segment = requireSegment(req);
      const pending = pendingCloses.get(segment.id);
      if (pending) {
        clearTimeout(pending);
        pendingCloses.delete(segment.id);
      }
      clearing.failSegment(segment.id);
      res.json({ segmentId: segment.id, status: "failed" });
    }),
  );

  // ------------------------------------------------------------------ auctions
  router.get(
    "/auctions/current",
    wrap((_req, res) => {
      const open = auction.ensureOpenAuction();
      res.json(auction.auctionState(open.slot));
    }),
  );

  router.get(
    "/auctions/:slot",
    wrap((req, res) => {
      const slot = Number(req.params.slot);
      assert(
        Number.isInteger(slot) && slot > 0,
        400,
        "slot must be a positive integer",
      );
      const state = auction.auctionState(slot);
      assert(state, 404, `no auction for slot ${slot}`);
      res.json(state);
    }),
  );

  // Demo control: force-close the open auction without waiting for the timer.
  router.post(
    "/auctions/current/close",
    wrap((_req, res) => {
      requireOrchestrator(orchestratorApiToken, _req);
      const open = auction.openAuction();
      assert(open, 409, "no open auction");
      const winner = auction.closeAuction(open.slot);
      res.json({
        slot: open.slot,
        winner: winner ? toSharedBid(winner) : null,
        next: auction.auctionState(auction.openAuction()?.slot ?? 0) ?? null,
      });
    }),
  );

  // ------------------------------------------------------------------ stream
  router.get(
    "/stream/snapshot",
    wrap((_req, res) => {
      res.json(composeSnapshot(ledger, bus, auction, clearing));
    }),
  );

  // Public, identity-free price-of-attention history. JSON is canonical;
  // CSV is provided for simple exports and early market analysis.
  router.get(
    "/stream/price-history",
    wrap((req, res) => {
      const limit =
        req.query.limit === undefined ? undefined : Number(req.query.limit);
      const since =
        req.query.since === undefined
          ? undefined
          : Date.parse(String(req.query.since));
      assert(
        limit === undefined || (Number.isInteger(limit) && limit > 0),
        400,
        "limit must be a positive integer",
      );
      assert(
        since === undefined || Number.isFinite(since),
        400,
        "since must be an ISO timestamp",
      );
      const points = priceHistoryFromSegments(
        [...ledger.segments.values()]
          .filter((segment) => segment.status === "done")
          .sort(
            (a, b) =>
              (b.clearedAtMs ?? 0) - (a.clearedAtMs ?? 0) || b.slot - a.slot,
          )
          .map((segment) => ({
            id: segment.id,
            slot: segment.slot,
            brandId: segment.brandId,
            durationSeconds: segment.durationSec,
            summary: segment.summary,
            status: segment.status,
            ...(segment.clearedAmountCents !== undefined
              ? {
                  clearedAmountUsd: centsToUsd(segment.clearedAmountCents),
                }
              : {}),
            ...(segment.clearedAtMs !== undefined
              ? { clearedAtMs: segment.clearedAtMs }
              : {}),
          })),
        { limit, since },
      );
      if (String(req.query.format ?? "json").toLowerCase() === "csv") {
        res.type("text/csv").send(priceHistoryCsv(points));
        return;
      }
      assert(
        String(req.query.format ?? "json").toLowerCase() === "json",
        400,
        "format must be json or csv",
      );
      res.json({ points });
    }),
  );

  // Reconnect replay for the gateway when Redis is unavailable (in-memory bus).
  router.get(
    "/events",
    wrap((req, res) => {
      const after = Number(req.query.after ?? 0);
      assert(
        Number.isFinite(after) && after >= 0,
        400,
        "after must be a non-negative number",
      );
      res.json({ deliveries: bus.since(after), asOfSequence: bus.sequence });
    }),
  );

  return router;
}

export function apiErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  errHandler(err, req, res);
}
