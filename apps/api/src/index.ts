// Lane 2 bootstrap: ledger, marketplace bus, engines, HTTPS surface.
// Runs with zero config for the hackathon (in-memory ledger, mock Stripe,
// stub verifier, in-memory bus); REDIS_URL / PROOF_VERIFIER_URL upgrade the
// seams without touching the rest.

import express from "express";
import { AuctionEngine } from "./auction.js";
import { ClearingEngine } from "./clearing.js";
import { MarketplaceBus, connectRedisPublisher } from "./bus.js";
import { isStripeLive, loadEnv } from "./env.js";
import { Ledger } from "./ledger.js";
import { MarketService } from "./market.js";
import { apiErrorHandler, createRouter } from "./routes.js";
import { DEMO_SCRAPED_COMPANIES } from "./demoSeed.js";
import { centsToUsd } from "./money.js";
import { createVerifier } from "./verifier.js";
import { StripeService } from "./stripe.js";

const env = loadEnv();

const ledger = new Ledger();
const redis = await connectRedisPublisher(env.redisUrl);
const bus = new MarketplaceBus(redis);
const verifier = createVerifier(
  env.proofVerifierMode,
  env.proofVerifierUrl,
  env.proofVerifierToken,
);
const clearing = new ClearingEngine(ledger, bus, verifier, {
  listenerPct: env.defaultListenerPct,
  platformPct: env.defaultPlatformPct,
  activeListenerWindowMs: env.activeListenerWindowSec * 1000,
});
const auction = new AuctionEngine(ledger, bus, {
  auctionDurationSec: env.auctionDurationSec,
  thresholdFraction: env.thresholdFraction,
  onWinner: (winner, segment) => {
    console.log(
      `[auction] slot ${winner.slot} won by ${winner.brandId} at ${centsToUsd(winner.amountCents).toFixed(2)} USD -> segment ${segment.id}`,
    );
  },
});
const market = new MarketService(ledger);

const stripeService = isStripeLive(env)
  ? new StripeService({
      secretKey: env.stripeSecretKey,
      webhookSecret: env.stripeWebhookSecret,
      successBaseUrl: env.stripeSuccessBaseUrl,
      ledger,
      market,
    })
  : undefined;
if (stripeService) console.log("[stripe] live mode enabled");

// Demo seed: funded fictional brands so the auction runs cold (SEED_DEMO=0 disables).
if (env.seedDemo) {
  for (const seed of [
    {
      name: "ACME AI",
      primaryColor: "#2563eb",
      secondaryColor: "#7dd3fc",
      brief:
        "ACME AI — the all-in-one AI copilot for teams that ship. Fast, reliable, slightly sentient.",
    },
    {
      name: "COOLSTARTUP",
      primaryColor: "#f97316",
      secondaryColor: "#fde047",
      brief:
        "COOLSTARTUP — sparkling water for people who mainline espresso. Launch week, everything 20% off.",
    },
    {
      name: "DOGFOOD",
      primaryColor: "#10b981",
      secondaryColor: "#a7f3d0",
      brief:
        "DOGFOOD — the project management tool we use to build the project management tool.",
    },
  ]) {
    const identity =
      seed.name === "ACME AI"
        ? { id: "brand_acme", token: env.demoAcmeBrandToken }
        : undefined;
    const { brand } = market.createBrand(seed, identity);
    market.topUp({ brandId: brand.id, amountUsd: 500 });
  }
  console.log(`[seed] demo brands funded with ${"$"}500 each`);
  const scraped = ledger.insertScrapedCompanies(DEMO_SCRAPED_COMPANIES);
  console.log(
    `[seed] ${scraped.added} scraped companies queued for free filler (${scraped.duplicates} duplicates skipped)`,
  );
}

// The market never stalls: there is always an auction for the next slot.
auction.ensureOpenAuction();

// Periodic big-screen stat refresh (docs/technical/backend.md — stats.updated).
const statsTimer = setInterval(() => {
  bus.publish({
    type: "stats.updated",
    listeners: clearing.activeListenerCount(),
    attentionProofs: clearing.totalAttentionProofs(),
    listenerRewardsUsd: centsToUsd(clearing.totalListenerRewardsCents()),
  });
}, 5000);
statsTimer.unref();

const app = express();
app.use((_req, res, next) => {
  // Lane 3's dev server serves the UIs from another origin.
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,authorization");
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Stripe webhook needs raw body — must be registered before express.json().
if (stripeService) {
  app.post(
    "/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const signature = req.header("stripe-signature") ?? "";
      try {
        await stripeService.handleWebhook(req.body as Buffer, signature);
        res.sendStatus(200);
      } catch (err) {
        console.error("[stripe] webhook error:", err);
        res.sendStatus(400);
      }
    },
  );
}

app.use(express.json());
app.use(
  createRouter({
    ledger,
    bus,
    auction,
    clearing,
    market,
    windowGraceSec: env.windowGraceSec,
    orchestratorApiToken: env.orchestratorApiToken,
    brandCreatorToken: env.brandCreatorToken,
    stripeService,
    publishLifecycleEvents: env.publishLifecycleEvents,
  }),
);
app.use(apiErrorHandler);

app.listen(env.port, () => {
  console.log(
    `slopstream api listening on :${env.port} (verifier=${env.proofVerifierMode}, redis=${redis ? "on" : "in-memory"}, lifecycle-events=${env.publishLifecycleEvents ? "api" : "orchestrator"})`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void bus.close().finally(() => process.exit(0));
  });
}
