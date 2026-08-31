import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import {
  createGenerationService,
  StubGenerationProvider,
} from "./generator.js";
import {
  createSqliteGenerationJobStore,
  SqliteGenerationJobStore,
} from "./sqliteJobStore.js";

const TEST_ASSET_BASE_URL = "https://assets.example.test";
const request = {
  segmentId: "segment:durable",
  brandId: "brand:one",
  brief: "Persist this generation across restarts.",
  tier: "audio" as const,
  previousSummaries: [],
};

describe("SqliteGenerationJobStore", () => {
  it("replays identical requests after the in-memory process would have reset", async () => {
    const store = createSqliteGenerationJobStore(":memory:");
    const generator = createGenerationService(
      new StubGenerationProvider(TEST_ASSET_BASE_URL),
      store,
    );

    const first = await generator.generate(request);
    const replay = await generator.generate({ ...request });
    const conflict = await generator.generate({
      ...request,
      brief: "A conflicting brief for the same segment.",
    });

    expect(first.status).toBe("generated");
    expect(replay.status).toBe("replayed");
    if (replay.status === "replayed") {
      expect(replay.result.segmentId).toBe(request.segmentId);
      expect(replay.result.media.audio.contentType).toBe("audio/mpeg");
    }
    expect(conflict).toEqual({ status: "conflict" });
    store.close();
  });

  it("ignores a corrupt persisted row instead of returning it as success", async () => {
    const db = new DatabaseSync(":memory:");
    const store = new SqliteGenerationJobStore(db);
    db.prepare(
      `INSERT INTO generation_jobs (segment_id, fingerprint, result_json, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run("segment:bad", "fingerprint", "{not-json", Date.now());

    await expect(store.get("segment:bad")).resolves.toBeUndefined();
    store.close();
  });
});
