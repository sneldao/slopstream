import { describe, expect, it } from "vitest";
import { handleMcpRequest, type BroadcastClient } from "./mcpBroadcast.js";

function fakeClient(handler: (path: string) => unknown): {
  client: BroadcastClient;
  paths: string[];
} {
  const paths: string[] = [];
  return {
    paths,
    client: {
      async get(path) {
        paths.push(path);
        return handler(path);
      },
    },
  };
}

const SLOT = {
  segmentId: "seg_1",
  slot: 4,
  status: "done",
  attention: { validProofs: 3, requiredProofs: 2, thresholdMet: true },
  settlement: { settles: true, clearedAmountUsd: 12.5 },
};

describe("broadcast MCP server", () => {
  it("negotiates a protocol version the client can speak", async () => {
    const { client } = fakeClient(() => ({}));
    const known = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26" },
      },
      { client },
    );
    expect(known?.result).toMatchObject({
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "slopstream-broadcast" },
    });

    const unknown = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "initialize",
        params: { protocolVersion: "1999-01-01" },
      },
      { client },
    );
    expect(unknown?.result).toMatchObject({ protocolVersion: "2025-06-18" });
  });

  it("advertises only the three reads", async () => {
    const { client } = fakeClient(() => ({}));
    const listed = await handleMcpRequest(
      { jsonrpc: "2.0", id: 3, method: "tools/list" },
      { client },
    );
    const tools = (listed?.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((tool) => tool.name)).toEqual([
      "air_now",
      "air_history",
      "air_receipt",
    ]);
  });

  it("passes the projection through without adding or renaming a field", async () => {
    const { client, paths } = fakeClient(() => ({ nowPlaying: SLOT }));
    const called = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "air_now", arguments: {} },
      },
      { client },
    );
    expect(paths).toEqual(["/air/now"]);
    const result = called?.result as {
      content: Array<{ type: string; text: string }>;
      structuredContent: unknown;
      isError: boolean;
    };
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({ nowPlaying: SLOT });
    expect(JSON.parse(result.content[0]!.text)).toEqual({ nowPlaying: SLOT });
  });

  it("forwards history arguments and defaults to the unfiltered path", async () => {
    const { client, paths } = fakeClient(() => ({ slots: [SLOT] }));
    await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "air_history",
          arguments: { limit: 50, since: "2026-10-20T00:00:00.000Z" },
        },
      },
      { client },
    );
    expect(paths).toEqual([
      "/air/history?limit=50&since=2026-10-20T00%3A00%3A00.000Z",
    ]);

    await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "air_history", arguments: {} },
      },
      { client },
    );
    expect(paths[1]).toBe("/air/history");
  });

  it("escapes the receipt id and refuses to build a path without one", async () => {
    const { client, paths } = fakeClient(() => ({ slot: SLOT }));
    await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "air_receipt", arguments: { segmentId: "../admin" } },
      },
      { client },
    );
    expect(paths).toEqual(["/air/receipt/..%2Fadmin"]);

    const missing = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "air_receipt", arguments: {} },
      },
      { client },
    );
    expect(missing?.error).toBeUndefined();
    expect(missing?.result).toMatchObject({ isError: true });
  });

  it("reports an unreachable broadcast as a tool error, not a broken transport", async () => {
    const client: BroadcastClient = {
      async get() {
        throw new Error("broadcast api free tier allows 120 calls per 60s");
      },
    };
    const called = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "air_now", arguments: {} },
      },
      { client },
    );
    expect(called?.error).toBeUndefined();
    expect(called?.result).toMatchObject({
      isError: true,
      content: [
        {
          type: "text",
          text: "broadcast read failed: broadcast api free tier allows 120 calls per 60s",
        },
      ],
    });
  });

  it("answers an unknown tool or method with a protocol error", async () => {
    const { client } = fakeClient(() => ({}));
    const tool = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "air_take_over", arguments: {} },
      },
      { client },
    );
    expect(tool?.error).toMatchObject({ code: -32602 });

    const method = await handleMcpRequest(
      { jsonrpc: "2.0", id: 11, method: "resources/list" },
      { client },
    );
    expect(method?.error).toMatchObject({ code: -32601 });
  });

  it("stays silent on notifications", async () => {
    const { client } = fakeClient(() => ({}));
    expect(
      await handleMcpRequest(
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { client },
      ),
    ).toBeNull();
  });
});
