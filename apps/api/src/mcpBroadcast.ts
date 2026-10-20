// MCP server for the metered broadcast read surface — roadmap Phase 3b, P0.
//
// A thin stdio bridge onto GET /air/*. It adds no data and no trust: every
// field is whatever the HTTP projection already allows out of the API, so the
// injection boundary (author-written prose never leaves the process) is
// enforced once, in airApi.ts, rather than twice and out of sync. Replacing
// this with the official SDK later is a transport swap.
//
// Hand-rolled rather than `@modelcontextprotocol/sdk` on purpose: one process,
// no dependencies, and the only protocol surface used is initialize /
// tools/list / tools/call / ping. Log to stderr — stdout is the protocol.

import { createInterface } from "node:readline";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const SERVER_INFO = { name: "slopstream-broadcast", version: "1.0.0" };

type JsonId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: JsonId;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonId;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface BroadcastClient {
  get(path: string): Promise<unknown>;
}

export interface McpHandlerDeps {
  client: BroadcastClient;
  /** Newest protocol version to offer when the client names an unknown one. */
  defaultProtocolVersion?: string;
}

const TOOLS = [
  {
    name: "air_now",
    description:
      "What is on the Slopstream broadcast right now: the live slot, recently aired slots, the upcoming queue, and audience totals. Numbers, ids, and media URLs only — no transcript or narration text.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "air_history",
    description:
      "Slots that have already aired, newest first, with verified attention proof counts and settlement outcome. Slots with nothing to clear report settles: false.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Slots to return, 1-100. Defaults to 25.",
          minimum: 1,
          maximum: 100,
        },
        since: {
          type: "string",
          description: "ISO timestamp lower bound on playback start.",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "air_receipt",
    description:
      "One aired slot and the public nullifiers of its valid attention proofs, so the claim can be re-verified independently. Proofs are named by nullifier only — never by a listener.",
    inputSchema: {
      type: "object",
      properties: {
        segmentId: {
          type: "string",
          description: "Segment id from air_now or air_history.",
        },
      },
      required: ["segmentId"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
] as const;

function toolCall(
  text: string,
  structured?: unknown,
  isError = false,
): Record<string, unknown> {
  return {
    content: [{ type: "text", text }],
    ...(structured === undefined ? {} : { structuredContent: structured }),
    isError,
  };
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  client: BroadcastClient,
): Promise<Record<string, unknown>> {
  if (name === "air_now") {
    const payload = await client.get("/air/now");
    return toolCall(JSON.stringify(payload), payload);
  }
  if (name === "air_history") {
    const params = new URLSearchParams();
    if (typeof args.limit === "number") params.set("limit", String(args.limit));
    if (typeof args.since === "string") params.set("since", args.since);
    const query = params.toString();
    const payload = await client.get(
      query ? `/air/history?${query}` : "/air/history",
    );
    return toolCall(JSON.stringify(payload), payload);
  }
  if (name === "air_receipt") {
    const segmentId = args.segmentId;
    if (typeof segmentId !== "string" || segmentId.length === 0) {
      return toolCall("segmentId is required", undefined, true);
    }
    const payload = await client.get(
      `/air/receipt/${encodeURIComponent(segmentId)}`,
    );
    return toolCall(JSON.stringify(payload), payload);
  }
  return toolCall(`unknown tool ${name}`, undefined, true);
}

function response(id: JsonId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function failure(id: JsonId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * One request in, one response out — `null` for notifications, which take no
 * reply. Kept free of stdio so the protocol decisions are testable directly.
 */
export async function handleMcpRequest(
  raw: unknown,
  deps: McpHandlerDeps,
): Promise<JsonRpcResponse | null> {
  const request = (raw ?? {}) as JsonRpcRequest;
  const id = request.id ?? null;
  if (request.method === undefined) return null;
  if (id === null && request.method.startsWith("notifications/")) return null;

  switch (request.method) {
    case "initialize": {
      const requested = (request.params as { protocolVersion?: unknown })
        ?.protocolVersion;
      const supported = (PROTOCOL_VERSIONS as readonly string[]).includes(
        String(requested),
      )
        ? String(requested)
        : (deps.defaultProtocolVersion ?? PROTOCOL_VERSIONS[0]);
      return response(id, {
        protocolVersion: supported,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }
    case "ping":
      return response(id, {});
    case "tools/list":
      return response(id, { tools: TOOLS });
    case "tools/call": {
      const params = request.params as {
        name?: unknown;
        arguments?: unknown;
      };
      const name = typeof params?.name === "string" ? params.name : "";
      if (!TOOLS.some((tool) => tool.name === name)) {
        return failure(id, -32602, `unknown tool ${name || "(missing)"}`);
      }
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      try {
        return response(id, await callTool(name, args, deps.client));
      } catch (err) {
        // The read failed, which is a tool result rather than a protocol error:
        // the caller's loop should see "could not reach the broadcast", not a
        // broken transport.
        return response(
          id,
          toolCall(
            `broadcast read failed: ${(err as Error).message}`,
            undefined,
            true,
          ),
        );
      }
    }
    default:
      return failure(id, -32601, `method not found: ${request.method}`);
  }
}

export function createHttpBroadcastClient(baseUrl: string): BroadcastClient {
  const origin = baseUrl.replace(/\/+$/, "");
  return {
    async get(path) {
      const response = await fetch(`${origin}${path}`, {
        headers: { accept: "application/json" },
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : `http ${response.status}`;
        throw new Error(detail);
      }
      return body;
    },
  };
}

/** Newline-delimited JSON-RPC over stdio. */
export async function serveBroadcastMcp(
  input = process.stdin,
  output = process.stdout,
  client = createHttpBroadcastClient(
    process.env.SLOPSTREAM_API_URL ?? "http://127.0.0.1:4000",
  ),
): Promise<void> {
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      output.write(`${JSON.stringify(failure(null, -32700, "parse error"))}\n`);
      continue;
    }
    const reply = await handleMcpRequest(raw, { client });
    if (reply) output.write(`${JSON.stringify(reply)}\n`);
  }
}

const script = process.argv[1] ?? "";
// Import-safe: vitest loads this module for the protocol tests, and the stdio
// loop must not start there.
if (script.endsWith("mcpBroadcast.ts") || script.endsWith("mcpBroadcast.js")) {
  process.once("SIGINT", () => process.exit(0));
  await serveBroadcastMcp().catch((err: Error) => {
    process.stderr.write(`broadcast mcp stopped: ${err.message}\n`);
    process.exit(1);
  });
}
