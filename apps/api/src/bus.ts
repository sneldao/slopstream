// Lane 2's outbound live-event plane.
// Every marketplace WsEvent is wrapped in a WsDelivery envelope with a
// monotonic sequence + eventId, then published to the Redis `marketplace`
// topic (docs/hackathon/team-split.md — Redis topics). Lane 3 subscribes there
// and fans deliveries out over WebSocket.
//
// When REDIS_URL is unset/unreachable we degrade to an in-memory bus so
// `pnpm dev:api` still runs; Lane 3 can subscribe in-process in that mode.

import { randomUUID } from "node:crypto";
import {
  REDIS_TOPICS,
  type WsDelivery,
  type WsEvent,
} from "@slopstream/shared";
import { isoNow } from "./ids.js";

export type DeliveryListener = (delivery: WsDelivery) => void;

export interface EventBus {
  /** Assign sequence/eventId, record, and fan out. Returns the delivery. */
  publish(event: WsEvent): WsDelivery;
  /** Current (latest) sequence number; 0 before any event. */
  readonly sequence: number;
  /** Subscribe to deliveries (in-process fan-out / tests / no-Redis mode). */
  subscribe(listener: DeliveryListener): () => void;
  /** Replay deliveries with sequence > afterSequence (reconnect recovery). */
  since(afterSequence: number): WsDelivery[];
  close(): Promise<void>;
}

interface RedisLike {
  publish(channel: string, message: string): Promise<unknown>;
  quit(): Promise<unknown>;
}

export class MarketplaceBus implements EventBus {
  private seq = 0;
  private readonly log: WsDelivery[] = [];
  private readonly listeners = new Set<DeliveryListener>();
  private redis: RedisLike | null;

  constructor(redis: RedisLike | null = null) {
    this.redis = redis;
  }

  get sequence(): number {
    return this.seq;
  }

  publish(event: WsEvent): WsDelivery {
    const delivery: WsDelivery = {
      eventId: randomUUID(),
      sequence: ++this.seq,
      event,
    };
    this.log.push(delivery);
    if (this.log.length > 1000) this.log.shift();
    for (const listener of this.listeners) {
      try {
        listener(delivery);
      } catch {
        // A failing subscriber must not break marketplace settlement.
      }
    }
    if (this.redis) {
      this.redis
        .publish(REDIS_TOPICS.marketplace, JSON.stringify(delivery))
        .catch(() => {
          /* transient pub failure; the ledger remains source of truth */
        });
    }
    return delivery;
  }

  subscribe(listener: DeliveryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  since(afterSequence: number): WsDelivery[] {
    return this.log.filter((d) => d.sequence > afterSequence);
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => {});
      this.redis = null;
    }
  }
}

/** Connect a Redis publisher, or return null to run the in-memory fallback. */
export async function connectRedisPublisher(
  url?: string,
): Promise<RedisLike | null> {
  if (!url) return null;
  try {
    const { createClient } = await import("redis");
    const client = createClient({ url, socket: { reconnectStrategy: false } });
    client.on("error", () => {
      /* swallow; we fall back to in-memory rather than crash the API */
    });
    await client.connect();
    return client;
  } catch {
    console.warn(
      `[bus] Redis unavailable at ${url}; marketplace events stay in-process.`,
    );
    return null;
  }
}

/** Convenience for services: build a stats event timestamped now. */
export function stamp(): string {
  return isoNow();
}
