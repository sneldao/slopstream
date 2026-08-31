import { describe, expect, it, vi } from "vitest";

import {
  generateCreative,
  parseLlmCreative,
  parseLlmEndpoints,
  type CreativeInput,
} from "./llm.js";

const INPUT: CreativeInput = {
  subject: "Acme AI",
  description: "Acme reviews pull requests automatically.",
  formatName: "Cinematic Anthem",
  tone: "anthem",
  needsDescription: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function completionResponse(content: string): Response {
  return jsonResponse({ choices: [{ message: { content } }] });
}

describe("parseLlmEndpoints", () => {
  it("parses semicolon-separated baseUrl|apiKey|model entries", () => {
    expect(
      parseLlmEndpoints(
        "https://a.example/v1|key-1|model-a; https://b.example/v1|key-2|model-b",
      ),
    ).toEqual([
      { baseUrl: "https://a.example/v1", apiKey: "key-1", model: "model-a" },
      { baseUrl: "https://b.example/v1", apiKey: "key-2", model: "model-b" },
    ]);
  });

  it("returns undefined for empty or unset values (feature disabled)", () => {
    expect(parseLlmEndpoints(undefined)).toBeUndefined();
    expect(parseLlmEndpoints("")).toBeUndefined();
    expect(parseLlmEndpoints("  ;  ; ")).toBeUndefined();
  });

  it("throws on malformed non-empty entries", () => {
    expect(() => parseLlmEndpoints("https://a.example/v1|key-only")).toThrow(
      /baseUrl\|apiKey\|model/,
    );
    expect(() => parseLlmEndpoints("a|b|c|d")).toThrow();
  });

  it("caps the chain length", () => {
    const chain = parseLlmEndpoints("a|k1|m1;b|k2|m2;c|k3|m3;d|k4|m4", 2);
    expect(chain?.map((e) => e.model)).toEqual(["m1", "m2"]);
  });
});

describe("parseLlmCreative", () => {
  it("parses plain JSON", () => {
    expect(
      parseLlmCreative('{"productDescription":"Does X.","script":"Buy it."}'),
    ).toEqual({ productDescription: "Does X.", script: "Buy it." });
  });

  it("parses JSON wrapped in markdown fences", () => {
    expect(parseLlmCreative('```json\n{"script":"Buy it."}\n```')).toEqual({
      script: "Buy it.",
    });
  });

  it("parses JSON preceded by prose", () => {
    expect(
      parseLlmCreative('Here you go: {"script":"Buy it."} hope it helps'),
    ).toEqual({ script: "Buy it." });
  });

  it("handles braces inside strings", () => {
    expect(parseLlmCreative('{"script":"Use {braces} freely."}')).toEqual({
      script: "Use {braces} freely.",
    });
  });

  it("rejects invalid JSON, missing script, and non-objects", () => {
    expect(parseLlmCreative("not json at all")).toBeUndefined();
    expect(parseLlmCreative('{"script":""}')).toBeUndefined();
    expect(parseLlmCreative('{"productDescription":"only"}')).toBeUndefined();
    expect(parseLlmCreative('{"script": 42}')).toBeUndefined();
  });
});

describe("generateCreative", () => {
  const endpoints = [
    { baseUrl: "https://one.example/v1", apiKey: "k1", model: "model-1" },
    { baseUrl: "https://two.example/v1/", apiKey: "k2", model: "model-2" },
  ];

  it("falls back to the next endpoint when the first fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(
        completionResponse(
          '{"productDescription":"Does X.","script":"Buy it."}',
        ),
      );

    const creative = await generateCreative(endpoints, INPUT, { fetcher });

    expect(creative).toEqual({
      productDescription: "Does X.",
      script: "Buy it.",
      model: "model-2",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("sends the OpenAI-compatible request shape", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(completionResponse('{"script":"Buy it."}'));

    await generateCreative(endpoints, INPUT, { fetcher, timeoutMs: 1234 });

    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://one.example/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer k1",
    );
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe("model-1");
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages).toHaveLength(2);
  });

  it("strips a trailing slash from the base URL", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(completionResponse('{"script":"Buy it."}'));
    await generateCreative([endpoints[1]], INPUT, { fetcher });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://two.example/v1/chat/completions",
    );
  });

  it("returns undefined when every endpoint fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockRejectedValueOnce(new Error("network down"));

    await expect(
      generateCreative(endpoints, INPUT, { fetcher }),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns undefined when the chain replies unusable JSON", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(completionResponse("sorry, I cannot comply"));
    await expect(
      generateCreative(endpoints, INPUT, { fetcher }),
    ).resolves.toBeUndefined();
  });
});
