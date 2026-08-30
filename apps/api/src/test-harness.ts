import type { WsEvent } from "@slopstream/shared";
import { AuctionEngine } from "./auction.js";
import { MarketplaceBus } from "./bus.js";
import { Ledger } from "./ledger.js";
import { MarketService } from "./market.js";

export interface Harness {
  ledger: Ledger;
  bus: MarketplaceBus;
  market: MarketService;
  auction: AuctionEngine;
  events: WsEvent[];
  /** Advance or set the fake clock (ms). */
  setTime(ms: number): void;
}

export function setupHarness(opts?: { thresholdFraction?: number }): Harness {
  let now = 1_000_000_000;
  const ledger = new Ledger();
  const bus = new MarketplaceBus();
  const events: WsEvent[] = [];
  bus.subscribe((d) => events.push(d.event));
  const market = new MarketService(ledger);
  const noopTimer = { unref() {} } as unknown as NodeJS.Timeout;
  const auction = new AuctionEngine(ledger, bus, {
    auctionDurationSec: 60,
    thresholdFraction: opts?.thresholdFraction ?? 0.6,
    now: () => now,
    setTimeout: () => noopTimer,
  });
  return {
    ledger,
    bus,
    market,
    auction,
    events,
    setTime: (ms) => {
      now = ms;
    },
  };
}

/** Create a brand and fund it with `usd` available balance. */
export function fundedBrand(h: Harness, name: string, usd: number) {
  const { brand } = h.market.createBrand({
    name,
    primaryColor: "#ff0000",
    secondaryColor: "#00ff00",
    brief: `${name} brief`,
  });
  h.market.topUp({ brandId: brand.id, amountUsd: usd });
  return brand;
}
