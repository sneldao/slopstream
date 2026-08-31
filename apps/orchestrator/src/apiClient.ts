// Typed fetch wrappers for the Lane 2 API and the Lane 1 generator. The
// scheduler uses these to drive the segment lifecycle; error semantics are
// caller-chosen: nextChallenge maps 404 to null, closeWindow tolerates 409.
//
// Every fetch carries a timeout (AbortSignal.timeout) so a hung peer cannot
// strand an await forever. Aborts reject like any network error; the callers'
// existing catch blocks treat them as transient failures.

import type {
  AuctionState,
  GenerationRequest,
  GenerationResult,
  MediaManifest,
  PublicChallenge,
  ScrapedCompanySubmission,
  StreamSnapshot,
  WsDelivery,
} from "@slopstream/shared";

export interface PlayingReceipt {
  segmentId: string;
  startedAt: string;
  attentionThreshold: number;
}

type FetchLike = typeof fetch;

/** Lane 2 snapshot/auction reads and lifecycle POSTs are all fast local hops. */
const DEFAULT_API_TIMEOUT_MS = 10_000;
/** Generation can run for minutes; override via GENERATION_TIMEOUT_MS. */
const DEFAULT_GENERATION_TIMEOUT_MS = 180_000;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function timeoutMs(override: number | undefined, fallback: number): number {
  return override && Number.isFinite(override) && override > 0
    ? override
    : fallback;
}

export interface ApiClientTimeouts {
  /** Lane 2 snapshot/auction reads and lifecycle POSTs. */
  apiMs?: number;
  /** Generator requests (can run for minutes). */
  generationMs?: number;
}

export class ApiClient {
  private readonly apiBaseUrl: string;
  private readonly generatorBaseUrl: string;
  private readonly fetcher: FetchLike;
  private readonly orchestratorApiToken: string;
  private readonly generatorApiToken: string;
  private readonly apiTimeoutMs: number;
  private readonly generationTimeoutMs: number;

  constructor(
    apiBaseUrl: string,
    generatorBaseUrl: string,
    orchestratorApiToken = "slopstream-demo-orchestrator-token",
    generatorApiToken = "slopstream-demo-generator-token",
    fetcher: FetchLike = fetch,
    timeouts: ApiClientTimeouts = {},
  ) {
    this.apiBaseUrl = trimTrailingSlash(apiBaseUrl);
    this.generatorBaseUrl = trimTrailingSlash(generatorBaseUrl);
    this.orchestratorApiToken = orchestratorApiToken;
    this.generatorApiToken = generatorApiToken;
    this.fetcher = fetcher;
    this.apiTimeoutMs = timeoutMs(timeouts.apiMs, DEFAULT_API_TIMEOUT_MS);
    this.generationTimeoutMs = timeoutMs(
      timeouts.generationMs,
      DEFAULT_GENERATION_TIMEOUT_MS,
    );
  }

  /** fetch + AbortSignal.timeout; an abort rejects like any network error. */
  private fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeout: number,
  ): Promise<Response> {
    return this.fetcher(url, {
      ...init,
      signal: AbortSignal.timeout(timeout),
    });
  }

  // ------------------------------------------------------------------- reads

  async currentAuction(): Promise<AuctionState> {
    const res = await this.fetchWithTimeout(
      `${this.apiBaseUrl}/auctions/current`,
      {},
      this.apiTimeoutMs,
    );
    if (!res.ok) throw new Error(`/auctions/current responded ${res.status}`);
    return (await res.json()) as AuctionState;
  }

  async auctionForSlot(slot: number): Promise<AuctionState | null> {
    const res = await this.fetchWithTimeout(
      `${this.apiBaseUrl}/auctions/${slot}`,
      {},
      this.apiTimeoutMs,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`/auctions/${slot} responded ${res.status}`);
    return (await res.json()) as AuctionState;
  }

  async snapshot(): Promise<StreamSnapshot> {
    const res = await this.fetchWithTimeout(
      `${this.apiBaseUrl}/stream/snapshot`,
      {},
      this.apiTimeoutMs,
    );
    if (!res.ok) throw new Error(`/stream/snapshot responded ${res.status}`);
    return (await res.json()) as StreamSnapshot;
  }

  /** Polling cursor over the API bus (GET /events?after=N is sequence-based). */
  async eventsSince(
    after: number,
  ): Promise<{ deliveries: WsDelivery[]; asOfSequence: number }> {
    const res = await this.fetchWithTimeout(
      `${this.apiBaseUrl}/events?after=${after}`,
      {},
      this.apiTimeoutMs,
    );
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
    body: {
      assetUrl: string;
      media: MediaManifest;
      durationSec: number;
      summary: string;
    },
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

  /** Propagates errors: the scheduler only treats a segment as terminally
   *  failed once this call lands, otherwise the next poll tick retries. */
  async failSegment(segmentId: string): Promise<void> {
    await this.postApi(`/segments/${segmentId}/failed`, {});
  }

  /** Force-close the open auction (or recover an overdue one). */
  async closeCurrentAuction(): Promise<{ slot: number } | null> {
    const res = await this.postApiRaw("/auctions/current/close", {});
    if (res.status === 409) return null;
    if (!res.ok) {
      throw new Error(`/auctions/current/close responded ${res.status}`);
    }
    const body = (await res.json()) as { slot: number };
    return { slot: body.slot };
  }

  // -------------------------------------------------------- scraped companies

  /**
   * Cold-start ingestion: post scraped-company submissions to Lane 2. The
   * API dedupes by sourceUrl + (source, name) and returns counters.
   */
  async ingestScrapedCompanies(companies: ScrapedCompanySubmission[]): Promise<{
    added: number;
    duplicates: number;
  }> {
    const res = await this.postApiRaw("/companies/scraped", { companies });
    if (!res.ok) throw new Error(`/companies/scraped responded ${res.status}`);
    return (await res.json()) as { added: number; duplicates: number };
  }

  // --------------------------------------------------------------- generator

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const res = await this.fetchWithTimeout(
      `${this.generatorBaseUrl}/v1/generations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.generatorApiToken}`,
        },
        body: JSON.stringify(request),
      },
      this.generationTimeoutMs,
    );
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
    return this.fetchWithTimeout(
      `${this.apiBaseUrl}${path}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.orchestratorApiToken}`,
        },
        body: JSON.stringify(body),
      },
      this.apiTimeoutMs,
    );
  }
}
