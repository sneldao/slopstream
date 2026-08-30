// WS gateway — the single WebSocket endpoint all screens connect to after
// loading their REST snapshot, plus the reverse proxy for every other Lane 2
// REST call (docs/technical/backend.md — "Live transport architecture").
//
// The gateway owns ONE sequence space. Clients (apps/web/lib/useLiveStream)
// seed their sequence cursor from the snapshot's asOfSequence and treat any
// gap as fatal, so the gateway stamps every delivery with its own monotonic
// sequence and overwrites the snapshot's asOfSequence before returning it.
// Marketplace deliveries from the API bus are re-wrapped into the same space
// by the marketplace feed — API sequences never reach clients.
//
// HTTP on this port: GET /health locally, GET /stream/snapshot proxied with
// the gateway-stamped asOfSequence, everything else reverse-proxied to the
// API (method/path/query, content-type and authorization headers, buffered
// body). OPTIONS preflight is answered locally, mirroring apps/api CORS.

import { randomUUID } from "node:crypto";
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from "node:http";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import type {
  StreamSnapshot,
  StreamOpsMetrics,
  WsDelivery,
  WsEvent,
} from "@slopstream/shared";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
} as const;
const MAX_PROXY_BODY_BYTES = 1024 * 1024;

export interface GatewayOptions {
  apiBaseUrl: string;
  fetcher?: typeof fetch;
  getMetrics?: () => Promise<StreamOpsMetrics> | StreamOpsMetrics;
}

export class Gateway {
  /** The gateway's own monotonic sequence — the only space clients see. */
  private sequence = 0;
  private readonly clients = new Set<WebSocket>();
  /** Recent deliveries replayed to fresh connections so nothing early is lost. */
  private readonly recent: WsDelivery[] = [];
  private static readonly RECENT_LIMIT = 256;
  private readonly apiBaseUrl: string;
  private readonly fetcher: typeof fetch;
  private getMetrics?: () => Promise<StreamOpsMetrics> | StreamOpsMetrics;
  readonly server: Server;
  private readonly wss: WebSocketServer;
  private readonly heartbeat: NodeJS.Timeout;

  constructor(options: GatewayOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
    this.getMetrics = options.getMetrics;

    this.server = createServer((req, res) => {
      // Never let one broken request (aborted body, dead socket) take down
      // the whole gateway: handleHttp rejections are logged, and a 500 is
      // attempted only if the response is still writable.
      void this.handleHttp(req, res).catch((error: unknown) => {
        console.warn(
          `[gateway] request ${req.method ?? "?"} ${req.url ?? "/"} failed:`,
          error,
        );
        if (!res.headersSent && !res.writableEnded) {
          this.safeWrite(res, () => {
            res.writeHead(500, {
              ...CORS_HEADERS,
              "content-type": "application/json",
            });
            res.end(JSON.stringify({ error: "internal error" }));
          });
        }
      });
    });

    // Accept any path: clients connect to ws://host:port with no suffix.
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on("connection", (ws, request) => {
      this.clients.add(ws);
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      const parsedAfter = Number(requestUrl.searchParams.get("after") ?? 0);
      const after =
        Number.isSafeInteger(parsedAfter) && parsedAfter >= 0 ? parsedAfter : 0;
      for (const delivery of this.recent.filter(
        (item) => item.sequence > after,
      )) {
        ws.send(JSON.stringify(delivery));
      }
      ws.on("close", () => this.clients.delete(ws));
      ws.on("error", () => this.clients.delete(ws));
    });

    // Evict dead connections every 30s.
    this.heartbeat = setInterval(() => {
      for (const ws of this.clients) {
        if (ws.readyState === ws.OPEN) ws.ping();
        else this.clients.delete(ws);
      }
    }, 30_000);
    this.heartbeat.unref();
  }

  /** Wire the scheduler metrics provider after construction. */
  setMetricsProvider(
    provider: () => Promise<StreamOpsMetrics> | StreamOpsMetrics,
  ): void {
    this.getMetrics = provider;
  }

  /** The gateway's current sequence — stamped into snapshot responses. */
  get currentSequence(): number {
    return this.sequence;
  }

  /** Wrap a runtime event in the gateway sequence space and broadcast it.
   *  Pass eventId to preserve an upstream ID (marketplace feed ingest). */
  emit(event: WsEvent, eventId: string = randomUUID()): WsDelivery {
    const delivery: WsDelivery = {
      eventId,
      sequence: ++this.sequence,
      event,
    };
    this.recent.push(delivery);
    if (this.recent.length > Gateway.RECENT_LIMIT) this.recent.shift();
    this.broadcast(delivery);
    return delivery;
  }

  broadcast(delivery: WsDelivery): void {
    const data = JSON.stringify(delivery);
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  async close(): Promise<void> {
    clearInterval(this.heartbeat);
    for (const ws of this.clients) ws.close();
    this.clients.clear();
    this.wss.close();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private async handleHttp(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (url.pathname === "/health") {
      res.writeHead(200, {
        ...CORS_HEADERS,
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ ok: true, service: "slopstream-orchestrator" }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/stream/snapshot") {
      await this.handleSnapshot(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/ops/metrics") {
      await this.handleMetrics(res);
      return;
    }

    await this.proxy(req, res, url);
  }

  /** Fetch upstream, then overwrite asOfSequence with the gateway's own
   *  sequence so clients and deliveries share one sequence space. */
  private async handleMetrics(res: ServerResponse): Promise<void> {
    if (!this.getMetrics) {
      res.writeHead(503, {
        ...CORS_HEADERS,
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ error: "metrics unavailable" }));
      return;
    }
    try {
      const metrics = await this.getMetrics();
      res.writeHead(200, {
        ...CORS_HEADERS,
        "content-type": "application/json",
      });
      res.end(JSON.stringify(metrics));
    } catch {
      res.writeHead(502, {
        ...CORS_HEADERS,
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ error: "metrics unavailable" }));
    }
  }

  private async handleSnapshot(res: ServerResponse): Promise<void> {
    try {
      const upstream = await this.fetcher(`${this.apiBaseUrl}/stream/snapshot`);
      if (!upstream.ok) {
        throw new Error(`upstream responded ${upstream.status}`);
      }
      const snapshot = (await upstream.json()) as StreamSnapshot;
      snapshot.asOfSequence = this.sequence;
      res.writeHead(200, {
        ...CORS_HEADERS,
        "content-type": "application/json",
      });
      res.end(JSON.stringify(snapshot));
    } catch {
      res.writeHead(502, {
        ...CORS_HEADERS,
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ error: "snapshot unavailable" }));
    }
  }

  private async proxy(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const method = req.method ?? "GET";
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    try {
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_PROXY_BODY_BYTES) {
          tooLarge = true;
        } else {
          chunks.push(buffer);
        }
      }
    } catch {
      // The client aborted the request or disconnected mid-body. If we can
      // still answer, report the broken body; otherwise the client is gone
      // — there is nothing left to write to.
      if (!res.headersSent) {
        this.safeWrite(res, () => {
          res.writeHead(502, {
            ...CORS_HEADERS,
            "content-type": "application/json",
          });
          res.end(JSON.stringify({ error: "request body unavailable" }));
        });
      } else {
        res.destroy();
      }
      return;
    }
    if (tooLarge) {
      this.safeWrite(res, () => {
        res.writeHead(413, {
          ...CORS_HEADERS,
          "content-type": "application/json",
        });
        res.end(JSON.stringify({ error: "payload too large" }));
      });
      return;
    }
    const body = Buffer.concat(chunks);

    const headers: Record<string, string> = {};
    if (req.headers["content-type"]) {
      headers["content-type"] = req.headers["content-type"];
    }
    if (req.headers.authorization) {
      headers.authorization = req.headers.authorization;
    }

    try {
      const upstream = await this.fetcher(
        `${this.apiBaseUrl}${url.pathname}${url.search}`,
        {
          method,
          headers,
          body: method === "GET" || method === "HEAD" ? undefined : body,
        },
      );
      const responseHeaders: Record<string, string> = { ...CORS_HEADERS };
      const contentType = upstream.headers.get("content-type");
      if (contentType) responseHeaders["content-type"] = contentType;
      const responseBody = Buffer.from(await upstream.arrayBuffer());
      this.safeWrite(res, () => {
        res.writeHead(upstream.status, responseHeaders);
        res.end(responseBody);
      });
    } catch {
      this.safeWrite(res, () => {
        res.writeHead(502, {
          ...CORS_HEADERS,
          "content-type": "application/json",
        });
        res.end(JSON.stringify({ error: "upstream unavailable" }));
      });
    }
  }

  /** Response writes to a client that disconnected mid-request throw
   *  EPIPE/ECONNRESET; swallow those so a dead socket cannot reject out of
   *  handleHttp. */
  private safeWrite(res: ServerResponse, write: () => void): void {
    try {
      write();
    } catch (error) {
      console.warn("[gateway] response write to a dead socket:", error);
    }
  }
}
