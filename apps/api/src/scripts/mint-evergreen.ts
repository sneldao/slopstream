// Evergreen catalog mint tool (Phase 1 Eternal Loop — one-time session).
// Converts finished GenerationResults into content-addressed entries:
// media bytes land under <mediaDir>/kind/<sha>.<ext>, one JSON entry per
// file lands in <catalogDir>. The API byte-verifies every entry at boot,
// so a mint typo fails closed instead of airing silent bytes.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

export interface MintArgs {
  input: string;
  catalogDir: string;
  mediaDir: string;
  brandId: string;
  tier: string;
  label: string;
  dryRun: boolean;
}

export function parseMintArgs(argv: string[]): MintArgs {
  const pick = (name: string, fallback?: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1) return fallback;
    const value = argv[idx + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`${name} needs a value`);
    return value;
  };
  const input = pick("--in");
  const catalogDir = pick("--catalog-dir");
  const mediaDir = pick("--media-dir");
  const brandId = pick("--brandId");
  const tier = pick("--tier", "audio_image")!;
  const label = pick(
    "--label",
    "Unofficial AI-generated parody ad. Not affiliated with or endorsed by any real brand.",
  )!;
  if (!input || !catalogDir || !mediaDir || !brandId) {
    throw new Error(
      "usage: --in <queue.json> --catalog-dir <dir> --media-dir <dir> --brandId <id>",
    );
  }
  if (!["audio", "audio_image", "video", "premium"].includes(tier)) {
    throw new Error(
      `--tier must be audio|audio_image|video|premium (got ${tier})`,
    );
  }
  return {
    input,
    catalogDir,
    mediaDir,
    brandId,
    tier,
    label,
    dryRun: argv.includes("--dry-run"),
  };
}

async function main(): Promise<void> {
  const { mintEntry } = await import("./mint-evergreen-lib.js");
  const args = parseMintArgs(process.argv.slice(2));
  const queue = JSON.parse(readFileSync(args.input, "utf8")) as {
    results?: Array<{
      media?: {
        version: number;
        durationSec: number;
        audio: { url: string; contentType: string };
        visual?: { url: string; contentType: string; type: string };
      };
      durationSec?: number;
      transcript?: string;
      summary?: string;
    }>;
  };
  if (!Array.isArray(queue.results) || queue.results.length === 0) {
    throw new Error(
      `${args.input}: expected { results: GenerationResult[] } with at least one result`,
    );
  }
  let kept = 0;
  for (let i = 0; i < queue.results.length; i++) {
    const minted = await mintEntry(queue.results[i]!, i, args);
    if (args.dryRun)
      console.log(`[dry-run] would mint ${minted.id}: ${minted.audioKey}`);
    kept += 1;
  }
  console.log(
    `[mint-evergreen] ${args.dryRun ? "would mint" : "minted"} ${kept} entries from ${args.input}`,
  );
}

try {
  const script = process.argv[1] ?? "";
  const isEntrypoint =
    script.endsWith("mint-evergreen.ts") ||
    script.endsWith("mint-evergreen.js");
  // Import-safe: vitest (and any other importer) loads this module without a
  // matching entrypoint, so the CLI main must not run — or process.exit(1)
  // would kill the test collector.
  if (isEntrypoint) {
    await main();
  }
} catch (error) {
  console.error(`[mint-evergreen] ${(error as Error).message}`);
  process.exit(1);
}
