import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { GenerationResult } from "@slopstream/shared";
import { isMediaManifest } from "@slopstream/shared";

import type { GenerationJobStore } from "./generator.js";

interface CompletedGeneration {
  fingerprint: string;
  result: GenerationResult;
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS generation_jobs (
  segment_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  result_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

function isCompletedResult(
  value: unknown,
  segmentId: string,
): value is GenerationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as GenerationResult;
  return (
    result.segmentId === segmentId &&
    typeof result.assetUrl === "string" &&
    result.assetUrl.length > 0 &&
    isMediaManifest(result.media) &&
    Number.isFinite(result.durationSec) &&
    result.durationSec > 0 &&
    typeof result.transcript === "string" &&
    result.transcript.length > 0 &&
    typeof result.summary === "string" &&
    result.summary.length > 0
  );
}

/** Durable GenerationJobStore for a single-node Coolify volume. */
export class SqliteGenerationJobStore implements GenerationJobStore {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(SCHEMA);
  }

  async get(segmentId: string): Promise<CompletedGeneration | undefined> {
    const row = this.db
      .prepare(
        "SELECT fingerprint, result_json FROM generation_jobs WHERE segment_id = ?",
      )
      .get(segmentId) as
      { fingerprint: string; result_json: string } | undefined;
    if (!row) return undefined;

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.result_json);
    } catch {
      return undefined;
    }
    if (!isCompletedResult(parsed, segmentId)) return undefined;
    return { fingerprint: row.fingerprint, result: parsed };
  }

  async put(segmentId: string, completed: CompletedGeneration): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO generation_jobs (segment_id, fingerprint, result_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(segment_id) DO UPDATE SET
           fingerprint = excluded.fingerprint,
           result_json = excluded.result_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        segmentId,
        completed.fingerprint,
        JSON.stringify(completed.result),
        Date.now(),
      );
  }

  close(): void {
    this.db.close();
  }
}

export function createSqliteGenerationJobStore(
  databasePath: string,
): SqliteGenerationJobStore {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  return new SqliteGenerationJobStore(new DatabaseSync(databasePath));
}
