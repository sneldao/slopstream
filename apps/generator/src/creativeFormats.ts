/**
 * Creative format rotation — picks a varied ad format for each generation
 * request so consecutive ads don't sound identical.
 *
 * Word budget: keep VO roughly 12–18 spoken seconds (~35–50 words). Format
 * supplies tone + one short sting; the brand brief is truncated, not padded.
 */

import type { GenerationMarketContext } from "@slopstream/shared";

export interface CreativeFormat {
  /** Human-readable name for UI display. */
  name: string;
  /** Short tone descriptor, e.g. "comedy", "anthem", "noir". */
  tone: string;
  /** Preferred ElevenLabs voice ID. */
  voiceId: string;
  /** Visual style hint for image/video prompts. */
  imageStyle: string;
  /** Produce the voiceover transcript from the request fields. */
  script: (args: ScriptArgs) => string;
}

export interface ScriptArgs {
  brand: string;
  brief: string;
  context?: string;
  market?: GenerationMarketContext;
}

/** Short market-aware sting — stays within the word budget when appended. */
export function marketSting(market?: GenerationMarketContext): string {
  if (!market) return "";
  if (market.attentionProgress !== undefined && market.attentionProgress >= 1) {
    return "The room proved it.";
  }
  if (market.leaderAmountUsd !== undefined && market.leaderAmountUsd >= 30) {
    return "The market is hot.";
  }
  if (market.nextSlotPriceUsd !== undefined && market.nextSlotPriceUsd >= 20) {
    return "Slots are moving.";
  }
  return "";
}

/** Soft cap on spoken words so ads stay punchy on the big screen. */
export const MAX_SCRIPT_WORDS = 45;
/** Soft cap on brand brief words before format wrapping. */
export const MAX_BRIEF_WORDS = 22;

/**
 * Collapse whitespace and keep the first `maxWords` words.
 */
export function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words
    .slice(0, maxWords)
    .join(" ")
    .replace(/[.,;:]+$/, "")}.`;
}

function withBudget(script: string): string {
  return truncateWords(script, MAX_SCRIPT_WORDS);
}

/**
 * ElevenLabs voice IDs from the public library.
 * These are stable, well-known preset voices.
 */
const VOICES = {
  george: "JBFqnCBsd6RMkjVDRZzb", // deep, narrator
  rachel: "21m00Tcm4TlvDq8ikWAM", // warm, conversational
  antoni: "ErXwobaYiNj19Updp6dD", // dramatic, deep
  bella: "EXAVITQu4vr4xnSDxMaL", // soft, expressive
  domi: "AZnzlk1XvdvUeBnXlCj9", // energetic, young
  elli: "MF3mGyEYCl7XYWbV9V6O", // emotive, warm
  josh: "TxGEqnHWrfWFTfGW9XjX", // deep, calm
  arnold: "VR6AewLTigWN4JW49xWj", // intense, powerful
} as const;

export const FORMATS: readonly CreativeFormat[] = [
  {
    name: "Comedy Monologue",
    tone: "comedy",
    voiceId: VOICES.domi,
    imageStyle:
      "playful, colorful, slightly absurd — think meme-meets-magazine",
    script: ({ brand, brief, market }) =>
      withBudget(
        `${brand}. ${truncateWords(brief, MAX_BRIEF_WORDS)} Boring software is a crime. ${marketSting(market)} ${brand}.`,
      ),
  },
  {
    name: "Cinematic Anthem",
    tone: "anthem",
    voiceId: VOICES.antoni,
    imageStyle:
      "epic, cinematic, dramatic lighting — hero shot with deep shadows",
    script: ({ brand, brief, market }) =>
      withBudget(
        `${brand}. ${truncateWords(brief, MAX_BRIEF_WORDS)} The future doesn't wait. ${marketSting(market)} ${brand}.`,
      ),
  },
  {
    name: "Late Night Radio",
    tone: "radio",
    voiceId: VOICES.josh,
    imageStyle:
      "moody, nocturnal, neon-lit — like a 2am cityscape with the product glowing",
    script: ({ brand, brief, market }) =>
      withBudget(
        `Tonight's sponsor: ${brand}. ${truncateWords(brief, MAX_BRIEF_WORDS)} ${marketSting(market)} Stay tuned.`,
      ),
  },
  {
    name: "Infomercial Parody",
    tone: "infomercial",
    voiceId: VOICES.arnold,
    imageStyle:
      "over-the-top, bold colors, exaggerated — like a 90s TV ad on steroids",
    script: ({ brand, brief, market }) =>
      withBudget(
        `${brand} is here! ${truncateWords(brief, MAX_BRIEF_WORDS)} ${marketSting(market)} It actually works.`,
      ),
  },
  {
    name: "Soft Launch",
    tone: "intimate",
    voiceId: VOICES.elli,
    imageStyle:
      "minimal, elegant, soft focus — like a premium lifestyle brand campaign",
    script: ({ brand, brief, market }) =>
      withBudget(
        `Hey. ${brand}. ${truncateWords(brief, MAX_BRIEF_WORDS)} ${marketSting(market)} It just works.`,
      ),
  },
  {
    name: "Hype Drop",
    tone: "hype",
    voiceId: VOICES.bella,
    imageStyle:
      "vibrant, explosive, graffiti-meets-tech — bold shapes and electric color",
    script: ({ brand, brief, market }) =>
      withBudget(
        `${brand} just dropped. ${truncateWords(brief, MAX_BRIEF_WORDS)} ${marketSting(market)} Get in early.`,
      ),
  },
  {
    name: "Documentary Voice",
    tone: "documentary",
    voiceId: VOICES.george,
    imageStyle:
      "nature-documentary-meets-tech — wide shots, shallow depth of field, serious",
    script: ({ brand, brief, market }) =>
      withBudget(
        `${brand}. ${truncateWords(brief, MAX_BRIEF_WORDS)} ${marketSting(market)} Evolution, accelerated.`,
      ),
  },
  {
    name: "News Bulletin",
    tone: "news",
    voiceId: VOICES.rachel,
    imageStyle:
      "clean, editorial, newsroom-style — sharp lines, confident composition",
    script: ({ brand, brief, market }) =>
      withBudget(
        `Breaking: ${brand}. ${truncateWords(brief, MAX_BRIEF_WORDS)} ${marketSting(market)} More as it develops.`,
      ),
  },
];

/**
 * Deterministically pick a format for a segment so replays are stable.
 * Uses FNV-1a hash for better distribution across short segment IDs.
 */
export function pickFormat(segmentId: string): CreativeFormat {
  let hash = 0x811c9dc5;
  for (let i = 0; i < segmentId.length; i++) {
    hash ^= segmentId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const index = (hash >>> 0) % FORMATS.length;
  return FORMATS[index];
}

/**
 * Pick a voice for a segment. If the format specifies a voice, use it.
 * Otherwise fall back to the provided default.
 */
export function voiceForFormat(
  format: CreativeFormat,
  fallbackVoiceId: string,
): string {
  return format.voiceId || fallbackVoiceId;
}
