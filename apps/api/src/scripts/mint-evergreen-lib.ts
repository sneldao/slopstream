import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { MintArgs } from "./mint-evergreen.js";

export function slugFor(brandId: string, index: number): string {
  const slug =
    brandId
      .replace(/^brand_/, "")
      .replace(/[^a-z0-9]+/gi, "_")
      .toLowerCase() || "spot";
  return `${slug}_${String(index + 1).padStart(2, "0")}`;
}

const EXT_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
};

const KIND_DIR: Record<string, string> = {
  audio: "audio",
  image: "image",
  video: "video",
};

export async function fetchMintBytes(url: string): Promise<Buffer> {
  if (url.startsWith("file:")) return readFileSync(new URL(url));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export interface MintQueueEntry {
  media?: {
    version: number;
    durationSec: number;
    audio: { url: string; contentType: string };
    visual?: { url: string; contentType: string; type: string };
  };
  durationSec?: number;
  transcript?: string;
  summary?: string;
}

export async function mintEntry(
  result: MintQueueEntry,
  index: number,
  args: MintArgs,
  writeFile: (path: string, bytes: Buffer | string) => void = (p, b) =>
    writeFileSync(p, b),
  fetchBytes: (url: string) => Promise<Buffer> = fetchMintBytes,
): Promise<{ id: string; audioKey: string; visualKey?: string }> {
  const media = result.media;
  if (!media?.audio?.url)
    throw new Error(
      `results[${index}]: missing media.audio.url — curate keepers only`,
    );
  if (!result.transcript?.trim())
    throw new Error(
      `results[${index}]: missing transcript — challenges need it`,
    );
  const out: {
    audio: { key: string; contentType: string; sha256: string; kind: "audio" };
    visual?: {
      key: string;
      contentType: string;
      sha256: string;
      kind: "image" | "video";
    };
  } = {
    audio: { key: "", contentType: "", sha256: "", kind: "audio" },
  };
  const jobs: Array<{
    url: string;
    kind: "audio" | "image" | "video";
    contentType: string;
  }> = [
    {
      url: media.audio.url,
      kind: "audio",
      contentType: media.audio.contentType,
    },
  ];
  if (media.visual && args.tier !== "audio") {
    jobs.push({
      url: media.visual.url,
      kind: media.visual.type === "video" ? "video" : "image",
      contentType: media.visual.contentType,
    });
  }
  for (const job of jobs) {
    const bytes = await fetchBytes(job.url);
    const sha = createHash("sha256").update(bytes).digest("hex");
    const ext =
      EXT_BY_MIME[job.contentType] ??
      extname(new URL(job.url, "file:///").pathname).slice(1) ??
      "bin";
    const key = `${KIND_DIR[job.kind]}/${sha}.${ext}`;
    if (!args.dryRun) {
      mkdirSync(join(args.mediaDir, KIND_DIR[job.kind]!), { recursive: true });
      writeFile(join(args.mediaDir, key), bytes);
    }
    const file = {
      key,
      contentType: job.contentType,
      sha256: sha,
      kind: job.kind,
    } as {
      key: string;
      contentType: string;
      sha256: string;
      kind: "audio" | "image" | "video";
    };
    if (job.kind === "audio") out.audio = { ...file, kind: "audio" as const };
    else
      out.visual = {
        ...file,
        kind: file.kind === "video" ? ("video" as const) : ("image" as const),
      };
  }
  const durationSec = Math.floor(result.durationSec ?? media.durationSec ?? 18);
  const id = `evergreen_${slugFor(args.brandId, index)}`;
  const briefText =
    result.summary?.trim() || result.transcript!.trim().slice(0, 140);
  const entry = {
    id,
    version: 1,
    brandId: args.brandId,
    tier: args.tier,
    durationSec,
    transcript: result.transcript!.trim(),
    summary: briefText,
    brief: `${args.label} ${briefText}`.trim(),
    media: out,
  };
  if (!args.dryRun) {
    mkdirSync(args.catalogDir, { recursive: true });
    writeFile(
      join(args.catalogDir, `${id}.json`),
      `${JSON.stringify(entry, null, 2)}\n`,
    );
  }
  return {
    id,
    audioKey: out.audio.key,
    ...(out.visual ? { visualKey: out.visual.key } : {}),
  };
}
