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
import type {
  AttentionProofSubmission,
  Bid,
  ChallengeSourceCommand,
  CreateBrandCommand,
  PlaceBidCommand,
  ProductionTier,
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

export interface ApiDeps {
  ledger: Ledger;
  bus: EventBus;
  auction: AuctionEngine;
  clearing: ClearingEngine;
  market: MarketService;
  /** Grace after playback end before the clearing evaluation runs. */
  windowGraceSec: number;
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
  const { ledger, bus, auction, clearing, market, windowGraceSec } = deps;
  const router = Router();
  // Deferred grace-period closes, keyed by segmentId, so /failed can cancel.
  const pendingCloses = new Map<string, NodeJS.Timeout>();

  // ------------------------------------------------------------------ health
  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "slopstream-api", sequence: bus.sequence });
  });

  // ------------------------------------------------------------------ brands
  router.post(
    "/brands",
    wrap((req, res) => {
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
    wrap((req, res) => {
      const brand = requireBrand(ledger, req);
      const cmd = req.body as TopUpCommand;
      assert(
        cmd?.brandId === brand.id,
        403,
        "top-up brandId must match the bearer brand",
      );
      res.status(201).json(market.topUp(cmd));
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
      const { bid, outbid } = auction.placeBid(brand, cmd.amountUsd);
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
      res
        .status(didResume ? 200 : 201)
        .json({ token: sessionToken, session: toListenerSession(session) });
    }),
  );

  router.get(
    "/listener-sessions/me",
    wrap((req, res) => {
      const session = requireListener(ledger, req);
      res.json({ session: toListenerSession(session) });
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
  // These endpoints persist state AND publish the corresponding runtime events
  // so the live flow works before Lane 3's orchestrator exists. Once the
  // orchestrator emits segment.*/challenge.fired on the runtime topic itself,
  // the publications here must come out — exactly one emitter per WsEvent.
  function requireSegment(req: Request) {
    const segmentId = String(req.params.segmentId);
    const segment = ledger.segments.get(segmentId);
    assert(segment, 404, `unknown segment ${segmentId}`);
    return segment;
  }

  router.post(
    "/segments/:segmentId/generating",
    wrap((req, res) => {
      const segment = requireSegment(req);
      segment.status = "generating";
      const tier: ProductionTier =
        (segment.bidId ? ledger.bids.get(segment.bidId)?.tier : undefined) ??
        "audio";
      bus.publish({
        type: "segment.generating",
        segmentId: segment.id,
        slot: segment.slot,
        tier,
      });
      res.json({ segmentId: segment.id, status: segment.status });
    }),
  );

  router.post(
    "/segments/:segmentId/ready",
    wrap((req, res) => {
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
      segment.mediaUrl = body.assetUrl;
      if (typeof body.durationSec === "number" && body.durationSec > 0) {
        segment.durationSec = Math.round(body.durationSec);
      }
      if (typeof body.summary === "string") segment.summary = body.summary;
      segment.status = "ready";
      bus.publish({
        type: "segment.ready",
        segmentId: segment.id,
        assetUrl: segment.mediaUrl!,
        durationSec: segment.durationSec,
      });
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
      const segment = requireSegment(req);
      const body = req.body as Omit<ChallengeSourceCommand, "segmentId">;
      assert(
        typeof body?.transcript === "string" && body.transcript.length > 0,
        400,
        "transcript is required",
      );
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
      const segment = requireSegment(req);
      const challenge = nextUnfired(ledger, segment.id);
      assert(challenge, 404, "no unfired challenges remain for this segment");
      challenge.firedAtMs = Date.now();
      const publicChallenge = toPublic(challenge);
      bus.publish({ type: "challenge.fired", challenge: publicChallenge });
      res.json({ challenge: publicChallenge });
    }),
  );

  // Playback start opens the attention window and freezes the threshold.
  router.post(
    "/segments/:segmentId/playing",
    wrap((req, res) => {
      const segment = requireSegment(req);
      const opened = clearing.openWindow(segment.id, Date.now());
      const startedAt = new Date(opened.windowOpenedAtMs!).toISOString();
      bus.publish({
        type: "segment.playing",
        segmentId: opened.id,
        startedAt,
      });
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
      const segment = requireSegment(req);
      assert(!segment.windowClosed, 409, "window already closed");
      assert(
        segment.windowClosingAtMs === undefined,
        409,
        "window close already scheduled",
      );
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
