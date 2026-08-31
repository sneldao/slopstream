import Stripe from "stripe";
import type { Ledger } from "./ledger.js";
import type { MarketService } from "./market.js";
import { usdToCents } from "./money.js";

export class StripeService {
  private stripe: Stripe;
  private webhookSecret: string;
  private successBaseUrl: string;
  private ledger: Ledger;
  private market: MarketService;

  constructor(opts: {
    secretKey: string;
    webhookSecret: string;
    successBaseUrl: string;
    ledger: Ledger;
    market: MarketService;
  }) {
    this.stripe = new Stripe(opts.secretKey);
    this.webhookSecret = opts.webhookSecret;
    this.successBaseUrl = opts.successBaseUrl;
    this.ledger = opts.ledger;
    this.market = opts.market;
  }

  async createCheckoutSession(
    brandId: string,
    amountUsd: number,
  ): Promise<{ checkoutUrl: string; sessionId: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amountUsd * 100),
            product_data: { name: "Slopstream Ad Credit" },
          },
          quantity: 1,
        },
      ],
      metadata: { brandId },
      success_url: `${this.successBaseUrl}/brand/top-up/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.successBaseUrl}/brand/top-up`,
    });

    return {
      checkoutUrl: session.url ?? "",
      sessionId: session.id,
    };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );

    if (event.type !== "checkout.session.completed") return;

    const session = event.data.object as Stripe.Checkout.Session;
    const brandId = session.metadata?.brandId;
    const amountTotal = session.amount_total;

    if (!brandId || amountTotal === null || amountTotal === undefined) return;
    if (this.ledger.processedStripeSessions.has(session.id)) return;

    this.ledger.processedStripeSessions.add(session.id);
    this.market.creditFromStripe(brandId, amountTotal);
  }
}
