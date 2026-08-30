// Attention challenge engine (docs/technical/backend.md — Attention challenge
// engine). Lane 2 decides WHAT challenges exist; Lane 3 decides WHEN they fire.
// Challenges are pre-generated from the segment transcript at ingestion time,
// and the full Challenge (with answer) never leaves this process — only
// PublicChallenge projections are handed to the orchestrator for broadcast.

import type {
  ChallengeSourceCommand,
  ChallengeType,
  PublicChallenge,
} from "@slopstream/shared";
import { newId } from "./ids.js";
import type { ChallengeRow, Ledger } from "./ledger.js";

const DISTRACTORS = [
  "PostgreSQL",
  "MongoDB",
  "Redis",
  "SQLite",
  "Kafka",
  "GraphQL",
];
const STOPWORDS = new Set([
  "The",
  "This",
  "That",
  "With",
  "From",
  "Your",
  "Our",
  "And",
  "But",
  "For",
]);

/** Salient entities from a transcript: capitalized words, deduplicated. */
export function extractEntities(transcript: string): string[] {
  const matches = transcript.match(/\b[A-Z][a-zA-Z0-9]{2,}\b/g) ?? [];
  const seen = new Set<string>();
  const entities: string[] = [];
  for (const m of matches) {
    if (STOPWORDS.has(m) || seen.has(m)) continue;
    seen.add(m);
    entities.push(m);
  }
  return entities;
}

/** Challenge validity windows, spread across the segment with a fixed width. */
function windows(
  durationSec: number,
  count: number,
  widthSec = 14,
): Array<[number, number]> {
  const usable = Math.max(durationSec - widthSec, widthSec);
  const start0 = Math.max(Math.floor(durationSec * 0.2), 2);
  const span = Math.max(usable - start0, 1);
  return Array.from({ length: count }, (_, i) => {
    const from =
      count === 1 ? start0 : start0 + Math.floor((span * i) / (count - 1));
    return [from, Math.min(from + widthSec, durationSec)] as [number, number];
  });
}

/**
 * Generate a segment's challenges from its transcript/metadata. The challenge
 * set and validity windows are deterministic for a given input; option order
 * is shuffled.
 */
export function generateChallenges(
  ledger: Ledger,
  cmd: ChallengeSourceCommand,
): ChallengeRow[] {
  const entities = extractEntities(cmd.transcript);
  const pool = [
    ...entities,
    ...DISTRACTORS.filter((d) => !entities.includes(d)),
  ];
  const made: ChallengeRow[] = [];

  const push = (
    type: ChallengeType,
    question: string,
    answer: string,
    difficulty: 1 | 2 | 3 | 4 | 5,
    options?: string[],
  ) => {
    made.push({
      id: newId("chal"),
      segmentId: cmd.segmentId,
      type,
      question,
      options,
      answer,
      validFrom: 0,
      validUntil: 0,
      difficulty,
    });
  };

  if (entities.length > 0) {
    const [first] = entities;
    const others = pool.filter((p) => p !== first).slice(0, 3);
    push(
      "recall",
      "What did the ad just mention?",
      first,
      2,
      shuffle([first, ...others]),
    );
    push("true_false", `True or false: the ad mentioned ${first}.`, "true", 1, [
      "true",
      "false",
    ]);
  }
  if (entities.length > 1) {
    const second = entities[1];
    const wrong = pool.find((p) => p !== second) ?? "SQLite";
    push(
      "true_false",
      `True or false: the ad mentioned ${wrong}.`,
      "false",
      2,
      ["true", "false"],
    );
    push(
      "sequence",
      `Which came first in the ad: ${entities[0]} or ${second}?`,
      entities[0],
      3,
      [entities[0], second],
    );
  }
  if (entities.length === 0) {
    // A transcript with no entities still yields one answerable challenge.
    const [distractor] = DISTRACTORS;
    push(
      "recall",
      "What did the ad just mention?",
      distractor,
      1,
      shuffle(DISTRACTORS.slice(0, 4)),
    );
  }

  const slots = windows(cmd.durationSec, made.length);
  made.forEach((c, i) => {
    const [from, until] = slots[i];
    c.validFrom = from;
    c.validUntil = until;
    ledger.challenges.set(c.id, c);
  });
  return made;
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Strip the answer — the only projection that may cross the WebSocket. */
export function toPublic(challenge: ChallengeRow): PublicChallenge {
  return {
    id: challenge.id,
    type: challenge.type,
    question: challenge.question,
    options: challenge.options,
    segmentId: challenge.segmentId,
    validFrom: challenge.validFrom,
    validUntil: challenge.validUntil,
    difficulty: challenge.difficulty,
  };
}

/** Next not-yet-fired challenge for a segment, in validity-window order. */
export function nextUnfired(
  ledger: Ledger,
  segmentId: string,
): ChallengeRow | undefined {
  return ledger
    .challengesForSegment(segmentId)
    .filter((c) => c.firedAtMs === undefined)
    .sort((a, b) => a.validFrom - b.validFrom)[0];
}

/** The challenge currently answerable, if any (for the snapshot). */
export function activeChallenge(
  ledger: Ledger,
  nowMs: number,
): PublicChallenge | undefined {
  for (const segment of ledger.segments.values()) {
    if (segment.status !== "playing" || segment.windowOpenedAtMs === undefined)
      continue;
    for (const challenge of ledger.challengesForSegment(segment.id)) {
      if (challenge.firedAtMs === undefined) continue;
      // Answerable only inside [validFrom, validUntil] of playback, so a
      // challenge fired early can't surface before it's answerable.
      const opensAt = segment.windowOpenedAtMs + challenge.validFrom * 1000;
      const closesAt = segment.windowOpenedAtMs + challenge.validUntil * 1000;
      if (nowMs >= opensAt && nowMs < closesAt) return toPublic(challenge);
    }
  }
  return undefined;
}
