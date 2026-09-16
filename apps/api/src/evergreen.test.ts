import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EvergreenEntry } from "@slopstream/shared";
import { validateEvergreenCatalog } from "./evergreenValidate.js";
import { loadEvergreenCatalogDir } from "./evergreenBoot.js";
import {
  airNextEvergreen,
  effectiveWeight,
  pickNextEvergreen,
  type EvergreenStore,
} from "./evergreenRotation.js";
import { Ledger } from "./ledger.js";
const sha = (s: string): string =>
  createHash("sha256").update(Buffer.from(s)).digest("hex");
const FILES = new Map<string, Buffer>([
  ["audio/" + "a".repeat(64) + ".mp3", Buffer.from("audio-bytes")],
  ["image/" + "b".repeat(64) + ".png", Buffer.from("image-bytes")],
]);
const readFile = (p: string): Buffer => {
  const key = p.split("/").slice(-2).join("/");
  const hit = FILES.get(key);
  if (!hit) throw new Error("missing");
  return hit;
};
function entry(over: Partial<EvergreenEntry> = {}): EvergreenEntry {
  return {
    id: "evergreen_test",
    version: 1,
    brandId: "brand_acme",
    tier: "audio_image",
    durationSec: 18,
    transcript: "Acme launches Rockets today.",
    summary: "Acme launch",
    brief: "Fun ad",
    media: {
      audio: {
        key: "audio/" + "a".repeat(64) + ".mp3",
        contentType: "audio/mpeg",
        sha256: sha("audio-bytes"),
        kind: "audio",
      },
      visual: {
        key: "image/" + "b".repeat(64) + ".png",
        contentType: "image/png",
        sha256: sha("image-bytes"),
        kind: "image",
      },
    },
    ...over,
  };
}
describe("validateEvergreenCatalog", () => {
  it("accepts a valid catalog with byte-verified media", () => {
    const out = validateEvergreenCatalog(
      { version: 1, entries: [entry()] },
      "/media",
      readFile,
    );
    expect(out.ok).toBe(true);
  });
  it("rejects hash mismatch", () => {
    const bad = entry({
      media: {
        audio: {
          key: "audio/" + "a".repeat(64) + ".mp3",
          contentType: "audio/mpeg",
          sha256: "0".repeat(64),
          kind: "audio",
        },
      },
    });
    expect(
      validateEvergreenCatalog(
        { version: 1, entries: [bad] },
        "/media",
        readFile,
      ).ok,
    ).toBe(false);
  });
  it("rejects missing file", () => {
    const bad = entry({
      id: "evergreen_missing",
      media: {
        audio: {
          key: "audio/" + "c".repeat(64) + ".mp3",
          contentType: "audio/mpeg",
          sha256: sha("audio-bytes"),
          kind: "audio",
        },
      },
    });
    expect(
      validateEvergreenCatalog(
        { version: 1, entries: [bad] },
        "/media",
        readFile,
      ).ok,
    ).toBe(false);
  });
  it("rejects bad id prefix and duplicates", () => {
    expect(
      validateEvergreenCatalog(
        { version: 1, entries: [entry({ id: "nope" })] },
        "/media",
        readFile,
      ).ok,
    ).toBe(false);
    expect(
      validateEvergreenCatalog(
        { version: 1, entries: [entry(), entry()] },
        "/media",
        readFile,
      ).ok,
    ).toBe(false);
  });
});
describe("rotation", () => {
  it("boosts weightUntil entries 3x", () => {
    const now = Date.now();
    expect(
      effectiveWeight(
        entry({ weightUntil: new Date(now + 99999).toISOString() }),
        now,
      ),
    ).toBe(3);
    expect(
      effectiveWeight(
        entry({ weightUntil: new Date(now - 99999).toISOString() }),
        now,
      ),
    ).toBe(1);
  });
  it("avoids last brand when alternative exists, least-aired first", () => {
    const a = entry({ id: "evergreen_a", brandId: "brand_a" });
    const b = entry({ id: "evergreen_b", brandId: "brand_b" });
    const states = new Map([
      ["evergreen_a", { entryId: "evergreen_a", airCount: 5 }],
    ]);
    expect(pickNextEvergreen([a, b], states, "brand_a", Date.now())?.id).toBe(
      "evergreen_b",
    );
  });
  it("airs a ready segment with public manifest and tracks state", () => {
    const store: EvergreenStore = {
      entries: [entry()],
      assetBaseUrl: "https://assets.example.test/slopstream",
      states: new Map(),
      thresholdFraction: 0.6,
    };
    const ledger = new Ledger();
    const out = airNextEvergreen(store, ledger, 7, 1_000_000);
    expect(out?.entry.id).toBe("evergreen_test");
    expect(out?.segment.status).toBe("ready");
    expect(out?.segment.slot).toBe(7);
    expect(out?.segment.media?.audio.url).toBe(
      `https://assets.example.test/slopstream/evergreen/media/audio/${"a".repeat(64)}.mp3`,
    );
    expect(store.states.get("evergreen_test")?.airCount).toBe(1);
    expect(ledger.segments.get(out!.segment.id)?.brief).toBe("Fun ad");
  });

  it("repeats a single-entry catalog despite the variety penalty", () => {
    const only = entry({ id: "evergreen_only", brandId: "brand_solo" });
    const states = new Map([
      [
        "evergreen_only",
        { entryId: "evergreen_only", airCount: 4, lastAiredAtMs: 500 },
      ],
    ]);
    // Only candidate is the last brand — variety must not empty the list.
    expect(
      pickNextEvergreen([only], states, "brand_solo", Date.now())?.id,
    ).toBe("evergreen_only");
    const store: EvergreenStore = {
      entries: [only],
      assetBaseUrl: "https://assets.example.test/slopstream",
      states: new Map(),
      thresholdFraction: 0.6,
    };
    const ledger = new Ledger();
    const first = airNextEvergreen(store, ledger, 1, 1_000);
    const second = airNextEvergreen(store, ledger, 2, 2_000);
    expect(first?.entry.id).toBe("evergreen_only");
    expect(second?.entry.id).toBe("evergreen_only");
    expect(first?.segment.id).not.toBe(second?.segment.id);
  });

  it("picks catalog order on a cold boot with empty rotation state", () => {
    const a = entry({ id: "evergreen_a", brandId: "brand_a" });
    const b = entry({ id: "evergreen_b", brandId: "brand_b" });
    expect(pickNextEvergreen([a, b], new Map(), null, Date.now())?.id).toBe(
      "evergreen_a",
    );
  });

  it("decays the weightUntil boost at the boundary", () => {
    const now = 1_000_000;
    const boosted = entry({
      id: "evergreen_new",
      brandId: "brand_new",
      weightUntil: new Date(now + 1).toISOString(),
    });
    const plain = entry({ id: "evergreen_old", brandId: "brand_old" });
    // Before expiry the boosted entry wins despite catalog order.
    expect(pickNextEvergreen([plain, boosted], new Map(), null, now)?.id).toBe(
      "evergreen_new",
    );
    // After expiry both score 1.0 — catalog order wins again.
    expect(
      pickNextEvergreen([plain, boosted], new Map(), null, now + 60_000)?.id,
    ).toBe("evergreen_old");
  });

  it("never airs back-to-back brand repeats across a rotation chain", () => {
    const a = entry({ id: "evergreen_a", brandId: "brand_a" });
    const b = entry({ id: "evergreen_b", brandId: "brand_b" });
    const c = entry({ id: "evergreen_c", brandId: "brand_c" });
    const store: EvergreenStore = {
      entries: [a, b, c],
      assetBaseUrl: "https://assets.example.test/slopstream",
      states: new Map(),
      thresholdFraction: 0.6,
    };
    const ledger = new Ledger();
    let lastBrand: string | null = null;
    for (let slot = 1; slot <= 9; slot++) {
      const out = airNextEvergreen(store, ledger, slot, slot * 1_000);
      expect(out).not.toBeNull();
      expect(out?.entry.brandId).not.toBe(lastBrand);
      lastBrand = out?.entry.brandId ?? null;
    }
    // Full chain aired 3x each — least-aired-first balances the loop.
    for (const id of ["evergreen_a", "evergreen_b", "evergreen_c"]) {
      expect(store.states.get(id)?.airCount).toBe(3);
    }
  });
});

describe("loadEvergreenCatalogDir", () => {
  function writeCatalog(): {
    catalogDir: string;
    mediaDir: string;
    audioSha: string;
  } {
    const root = mkdtempSync(join(tmpdir(), "evergreen-boot-"));
    const catalogDir = join(root, "catalog");
    const mediaDir = join(root, "media");
    mkdirSync(catalogDir, { recursive: true });
    mkdirSync(join(mediaDir, "audio"), { recursive: true });
    const bytes = Buffer.from("boot-audio");
    const audioSha = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(join(mediaDir, "audio", `${audioSha}.mp3`), bytes);
    writeFileSync(
      join(catalogDir, "demo.json"),
      JSON.stringify({
        id: "evergreen_boot_demo",
        version: 1,
        brandId: "brand_boot",
        tier: "audio",
        durationSec: 18,
        transcript: "Boot launches Rockets today.",
        summary: "Boot launch",
        brief: "Boot ad",
        media: {
          audio: {
            key: `audio/${audioSha}.mp3`,
            contentType: "audio/mpeg",
            sha256: audioSha,
            kind: "audio",
          },
        },
      }),
    );
    return { catalogDir, mediaDir, audioSha };
  }

  it("boots a store with reseeded brands from disk", () => {
    const { catalogDir, mediaDir } = writeCatalog();
    const out = loadEvergreenCatalogDir({
      catalogDir,
      mediaDir,
      assetBaseUrl: "https://assets.example.test/slopstream",
      thresholdFraction: 0.6,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.store.entries.map((e) => e.id)).toEqual(["evergreen_boot_demo"]);
    expect(out.store.assetBaseUrl).toBe(
      "https://assets.example.test/slopstream",
    );
    expect(out.brands.map((b) => b.id)).toEqual(["brand_boot"]);
  });

  it("fails closed on partial config, bad origin, and byte mismatch", () => {
    const { catalogDir, mediaDir } = writeCatalog();
    expect(
      loadEvergreenCatalogDir({
        catalogDir,
        assetBaseUrl: "https://assets.example.test/s",
      }).ok,
    ).toBe(false);
    expect(
      loadEvergreenCatalogDir({
        catalogDir,
        mediaDir,
        assetBaseUrl: "http://localhost:4000/x",
      }).ok,
    ).toBe(false);
    const tampered = loadEvergreenCatalogDir({
      catalogDir,
      mediaDir: join(mediaDir, "missing"),
      assetBaseUrl: "https://assets.example.test/s",
    });
    expect(tampered.ok).toBe(false);
  });
});
