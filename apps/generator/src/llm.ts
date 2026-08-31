/**
 * Free-LLM creative fallback chain — OpenAI-compatible chat completions
 * endpoints (e.g. Featherless) that summarize messy scraped excerpts into a
 * clean product description and write the ad voiceover script. Every failure
 * degrades to the deterministic template scripts; the stream must never stall
 * on an LLM error, so nothing here throws.
 */

export interface LlmEndpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmCreative {
  /** Clean product description for prompts (free segments only). */
  productDescription?: string;
  /** Spoken voiceover script. */
  script: string;
  /** Model that produced the result — telemetry only. */
  model: string;
}

export const DEFAULT_LLM_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ENDPOINTS = 3;

/**
 * Parse `LLM_ENDPOINTS` — semicolon-separated `baseUrl|apiKey|model` entries,
 * tried in order. Empty/unset disables the feature; malformed entries throw at
 * startup (fail loud); capped so worst-case added latency stays bounded.
 */
export function parseLlmEndpoints(
  value: string | undefined,
  maxEndpoints = DEFAULT_MAX_ENDPOINTS,
): LlmEndpoint[] | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const endpoints: LlmEndpoint[] = [];
  for (const entry of trimmed.split(";")) {
    const clean = entry.trim();
    if (!clean) continue;
    const parts = clean.split("|").map((part) => part.trim());
    if (parts.length !== 3 || parts.some((part) => !part)) {
      throw new Error(
        `Invalid LLM_ENDPOINTS entry — expected baseUrl|apiKey|model, got "${clean}"`,
      );
    }
    endpoints.push({
      baseUrl: parts[0],
      apiKey: parts[1],
      model: parts[2],
    });
    if (endpoints.length >= maxEndpoints) break;
  }
  return endpoints.length > 0 ? endpoints : undefined;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

/** Parse a model reply into a creative, tolerating fences and prose. */
export function parseLlmCreative(
  text: string,
): { productDescription?: string; script: string } | undefined {
  const objectText = extractJsonObject(text);
  if (!objectText) return undefined;
  try {
    const parsed: unknown = JSON.parse(objectText);
    if (!parsed || typeof parsed !== "object") return undefined;
    const record = parsed as Record<string, unknown>;
    const script =
      typeof record.script === "string" ? record.script.trim() : "";
    if (!script) return undefined;
    const productDescription =
      typeof record.productDescription === "string" &&
      record.productDescription.trim()
        ? record.productDescription.trim()
        : undefined;
    return productDescription === undefined
      ? { script }
      : { productDescription, script };
  } catch {
    return undefined;
  }
}

/** First balanced `{...}` in the text, string-aware. */
function extractJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

export interface CreativeInput {
  subject: string;
  description: string;
  formatName: string;
  tone: string;
  /** Market beat the script may weave in (from marketSting). */
  marketSting?: string;
  /** True for free segments: also ask for a clean productDescription. */
  needsDescription: boolean;
}

export interface GenerateCreativeOptions {
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

/**
 * Try each endpoint in order; first usable JSON creative wins. Logs failures
 * with baseUrl + model only (never the key) and returns undefined when the
 * whole chain fails — callers fall back to templates.
 */
export async function generateCreative(
  endpoints: LlmEndpoint[],
  input: CreativeInput,
  options: GenerateCreativeOptions = {},
): Promise<LlmCreative | undefined> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
  const fetcher = options.fetcher ?? fetch;

  for (const endpoint of endpoints) {
    try {
      const base = endpoint.baseUrl.replace(/\/$/, "");
      const response = await fetcher(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${endpoint.apiKey}`,
        },
        body: JSON.stringify({
          model: endpoint.model,
          temperature: 0.7,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt(input) },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`responded ${response.status}`);
      const body = (await response.json()) as ChatCompletionResponse;
      const text = body.choices?.[0]?.message?.content ?? "";
      const creative = parseLlmCreative(text);
      if (!creative) throw new Error("returned no usable creative JSON");
      return { ...creative, model: endpoint.model };
    } catch (error) {
      console.warn(
        `[generator] LLM endpoint ${endpoint.baseUrl} (${endpoint.model}) failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return undefined;
}

const SYSTEM_PROMPT =
  "You write short, punchy ad copy for a live AI-generated ad stream. " +
  "Respond with raw JSON only — no markdown fences, no commentary. Schema: " +
  '{"productDescription": string (only when requested), "script": string}.';

function userPrompt(input: CreativeInput): string {
  const lines = [
    `Write a voiceover script for "${input.subject}".`,
    input.needsDescription
      ? `Scraped source text about the company (may be messy, first-person, or off-topic):\n"""\n${input.description}\n"""\n` +
        'Also produce "productDescription": one factual sentence (max 25 words) stating what the product actually does, based only on the source text — never invent features.'
      : `Product description: ${input.description}`,
    'Rules for "script":',
    "- Maximum 45 spoken words.",
    "- Spoken words only: no stage directions, brackets, emojis, URLs, or hashtags.",
    `- Tone: ${input.tone} (creative format: ${input.formatName}).`,
  ];
  if (input.marketSting) {
    lines.push(
      `- You may weave in this live market beat: "${input.marketSting}".`,
    );
  }
  lines.push(
    "- This is an unofficial AI-generated parody ad — never claim to be the company itself.",
    "Output raw JSON only.",
  );
  return lines.join("\n");
}
