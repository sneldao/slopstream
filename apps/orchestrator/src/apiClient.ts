// Typed fetch wrappers for the Lane 2 API and the Lane 1 generator. The
// scheduler uses these to drive the segment lifecycle; error semantics are
// caller-chosen: nextChallenge maps 404 to null, closeWindow tolerates 409.

import type {
  AuctionState,
  GenerationRequest,
  GenerationResult,
  PublicChallenge,
  StreamSnapshot,
  WsDelivery,
} from "@slopstream/shared";

export interface PlayingReceipt {
  segmentId: string;
  startedAt: string;
  attentionThreshold: number;
}

type FetchLike = typeof fetch;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

export class ApiClient {
  private readonly apiBaseUrl: string;
  private readonly generatorBaseUrl: string;
  private readonly fetcher: FetchLike;
  private readonly orchestratorApiToken: string;
  private readonly generatorApiToken: string;

  constructor(
    apiBaseUrl: string,
    generatorBaseUrl: string,
    orchestratorApiToken = "slopstream-demo-orchestrator-token",
    generatorApiToken = "slopstream-demo-generator-token",
    fetcher: FetchLike = fetch,
  ) {
    this.apiBaseUrl = trimTrailingSlash(apiBaseUrl);
    this.generatorBaseUrl = trimTrailingSlash(generatorBaseUrl);
    this.orchestratorApiToken = orchestratorApiToken;
    this.generatorApiToken = generatorApiToken;
    this.fetcher = fetcher;
  }

  // ------------------------------------------------------------------- reads

  async currentAuction(): Promise<AuctionState> {
    const res = await this.fetcher(`${this.apiBaseUrl}/auctions/current`);
    if (!res.ok) throw new Error(`/auctions/current responded ${res.status}`);
    return (await res.json()) as AuctionState;
  }

  async auctionForSlot(slot: number): Promise<AuctionState | null> {
    const res = await this.fetcher(`${this.apiBaseUrl}/auctions/${slot}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`/auctions/${slot} responded ${res.status}`);
    return (await res.json()) as AuctionState;
  }

  async snapshot(): Promise<StreamSnapshot> {
    const res = await this.fetcher(`${this.apiBaseUrl}/stream/snapshot`);
    if (!res.ok) throw new Error(`/stream/snapshot responded ${res.status}`);
    return (await res.json()) as StreamSnapshot;
  }

  /** Polling cursor over the API bus (GET /events?after=N is sequence-based). */
  async eventsSince(
    after: number,
  ): Promise<{ deliveries: WsDelivery[]; asOfSequence: number }> {
    const res = await this.fetcher(`${this.apiBaseUrl}/events?after=${after}`);
    if (!res.ok) throw new Error(`/events responded ${res.status}`);
    return (await res.json()) as {
      deliveries: WsDelivery[];
      asOfSequence: number;
    };
  }

  // --------------------------------------------------------------- lifecycle

  async markGenerating(segmentId: string): Promise<void> {
    await this.postApi(`/segments/${segmentId}/generating`, {});
  }

  async markReady(
    segmentId: string,
    body: { assetUrl: string; durationSec: number; summary: string },
  ): Promise<void> {
    await this.postApi(`/segments/${segmentId}/ready`, body);
  }

  async sendChallengeSource(
    segmentId: string,
    body: {
      transcript: string;
      durationSec: number;
      visualMetadata?: Record<string, unknown>;
      audioMetadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.postApi(`/segments/${segmentId}/challenge-source`, body);
  }

  /** Pulls the next unfired challenge. The API marks it fired on call — the
   *  scheduler broadcasts it when playback elapsed reaches validFrom. */
  async nextChallenge(segmentId: string): Promise<PublicChallenge | null> {
    const res = await this.postApiRaw(
      `/segments/${segmentId}/challenges/next`,
      {},
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`/challenges/next responded ${res.status}`);
    }
    const body = (await res.json()) as { challenge: PublicChallenge };
    return body.challenge;
  }

  async markPlaying(segmentId: string): Promise<PlayingReceipt> {
    const res = await this.postApiRaw(`/segments/${segmentId}/playing`, {});
    if (!res.ok) throw new Error(`/playing responded ${res.status}`);
    return (await res.json()) as PlayingReceipt;
  }

  /** 409 = already closed/scheduled; the scheduler treats that as success. */
  async closeWindow(segmentId: string): Promise<boolean> {
    const res = await this.postApiRaw(
      `/segments/${segmentId}/window-closed`,
      {},
    );
    if (res.status === 409) return false;
    if (!res.ok) throw new Error(`/window-closed responded ${res.status}`);
    return true;
  }

  async failSegment(segmentId: string): Promise<void> {
    try {
      await this.postApi(`/segments/${segmentId}/failed`, {});
    } catch (error) {
      console.warn(`[api-client] /failed for ${segmentId}:`, error);
    }
  }

  // --------------------------------------------------------------- generator

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const res = await this.fetcher(`${this.generatorBaseUrl}/v1/generations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.generatorApiToken}`,
      },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      throw new Error(`generator responded ${res.status}`);
    }
    return (await res.json()) as GenerationResult;
  }

  // ----------------------------------------------------------------- helpers

  private async postApi(path: string, body: unknown): Promise<void> {
    const res = await this.postApiRaw(path, body);
    if (!res.ok) throw new Error(`API ${path} responded ${res.status}`);
  }

  private postApiRaw(path: string, body: unknown): Promise<Response> {
    return this.fetcher(`${this.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.orchestratorApiToken}`,
      },
      body: JSON.stringify(body),
    });
  }
}
