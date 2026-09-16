// Evergreen catalog validation (docs/product/evergreen-loop.md Stage 1).
// Schema checks plus byte-level proof that every declared media file exists
// under mediaDir with matching SHA-256.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  EvergreenCatalog,
  EvergreenEntry,
  EvergreenMediaFile,
} from "@slopstream/shared";

export const EVERGREEN_ID_PREFIX = "evergreen_";
const SHA256_HEX = /^[a-f0-9]{64}$/;
const MEDIA_KEY =
  /^(audio|image|video)\/[a-f0-9]{64}\.(mp3|png|jpe?g|webp|mp4)$/;
const KIND_EXTENSIONS: Record<EvergreenMediaFile["kind"], string[]> = {
  audio: ["mp3"],
  image: ["png", "jpg", "jpeg", "webp"],
  video: ["mp4"],
};

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
type Fail = { ok: false; error: string };
const fail = (reason: string): Fail => ({ ok: false, error: reason });
function checkMediaFile(
  file: unknown,
  role: string,
): { ok: true; file: EvergreenMediaFile } | Fail {
  if (!file || typeof file !== "object" || Array.isArray(file))
    return fail(`${role}: must be an object`);
  const f = file as Record<string, unknown>;
  if (typeof f.key !== "string" || !MEDIA_KEY.test(f.key))
    return fail(`${role}.key must be kind/<sha>.<ext>`);
  if (typeof f.sha256 !== "string" || !SHA256_HEX.test(f.sha256))
    return fail(`${role}.sha256 must be hex`);
  if (f.kind !== "audio" && f.kind !== "image" && f.kind !== "video")
    return fail(`${role}.kind invalid`);
  const kind = f.kind as EvergreenMediaFile["kind"];
  const ext = (f.key as string)
    .slice((f.key as string).lastIndexOf(".") + 1)
    .toLowerCase();
  if (!KIND_EXTENSIONS[kind].includes(ext))
    return fail(`${role}: .${ext} mismatches ${kind}`);
  if (typeof f.contentType !== "string" || !f.contentType.includes("/"))
    return fail(`${role}.contentType invalid`);
  return {
    ok: true,
    file: {
      key: f.key as string,
      contentType: f.contentType as EvergreenMediaFile["contentType"],
      sha256: f.sha256 as string,
      kind,
    },
  };
}
export function checkEvergreenEntry(
  value: unknown,
  index: number,
): { ok: true; entry: EvergreenEntry } | Fail {
  const where = `entries[${index}]`;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(`${where}: must be object`);
  const e = value as Record<string, unknown>;
  if (typeof e.id !== "string" || !e.id.startsWith(EVERGREEN_ID_PREFIX))
    return fail(`${where}.id prefix`);
  if (e.version !== 1) return fail(`${where}.version must be 1`);
  if (typeof e.brandId !== "string" || !e.brandId)
    return fail(`${where}.brandId required`);
  if (
    e.tier !== "audio" &&
    e.tier !== "audio_image" &&
    e.tier !== "video" &&
    e.tier !== "premium"
  )
    return fail(`${where}.tier invalid`);
  if (
    typeof e.durationSec !== "number" ||
    !Number.isFinite(e.durationSec) ||
    e.durationSec < 5 ||
    e.durationSec > 300
  )
    return fail(`${where}.durationSec 5..300`);
  for (const f of ["transcript", "summary", "brief"] as const) {
    if (typeof e[f] !== "string" || !e[f].trim())
      return fail(`${where}.${f} required`);
  }
  if (!e.media || typeof e.media !== "object" || Array.isArray(e.media))
    return fail(`${where}.media required`);
  const media = e.media as Record<string, unknown>;
  const audio = checkMediaFile(media.audio, `${where}.media.audio`);
  if (!audio.ok) return audio;
  let visual: EvergreenMediaFile | undefined;
  if (media.visual !== undefined) {
    const v = checkMediaFile(media.visual, `${where}.media.visual`);
    if (!v.ok) return v;
    if (v.file.kind === "audio")
      return fail(`${where}.media.visual must be image/video`);
    visual = v.file;
  }
  if (
    e.weight !== undefined &&
    (typeof e.weight !== "number" ||
      !Number.isFinite(e.weight) ||
      e.weight <= 0)
  )
    return fail(`${where}.weight positive`);
  if (
    e.weightUntil !== undefined &&
    (typeof e.weightUntil !== "string" ||
      Number.isNaN(Date.parse(e.weightUntil)))
  )
    return fail(`${where}.weightUntil ISO`);
  return {
    ok: true,
    entry: {
      id: e.id as string,
      version: 1,
      brandId: e.brandId as string,
      tier: e.tier as EvergreenEntry["tier"],
      durationSec: e.durationSec as number,
      transcript: e.transcript as string,
      summary: e.summary as string,
      brief: e.brief as string,
      media: visual ? { audio: audio.file, visual } : { audio: audio.file },
      ...(typeof e.weight === "number" ? { weight: e.weight } : {}),
      ...(typeof e.weightUntil === "string"
        ? { weightUntil: e.weightUntil }
        : {}),
    },
  };
}
export function validateEvergreenCatalog(
  value: unknown,
  mediaDir: string,
  readFile: (p: string) => Buffer = (p) => readFileSync(p),
): { ok: true; catalog: EvergreenCatalog } | Fail {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("catalog must be object");
  const c = value as Record<string, unknown>;
  if (c.version !== 1) return fail("catalog.version must be 1");
  if (!Array.isArray(c.entries) || c.entries.length === 0)
    return fail("catalog.entries non-empty");
  const entries: EvergreenEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < c.entries.length; i++) {
    const checked = checkEvergreenEntry(c.entries[i], i);
    if (!checked.ok) return checked;
    if (seen.has(checked.entry.id))
      return fail(`duplicate ${checked.entry.id}`);
    seen.add(checked.entry.id);
    entries.push(checked.entry);
  }
  for (const entry of entries) {
    const files = [
      entry.media.audio,
      ...(entry.media.visual ? [entry.media.visual] : []),
    ];
    for (const file of files) {
      let bytes: Buffer;
      try {
        bytes = readFile(join(mediaDir, file.key));
      } catch {
        return fail(`${entry.id}: missing ${file.key}`);
      }
      if (sha256Hex(bytes) !== file.sha256)
        return fail(`${entry.id}: hash mismatch ${file.key}`);
    }
  }
  return { ok: true, catalog: { version: 1, entries } };
}
export function loadEvergreenCatalogDir(
  catalogDir: string,
  mediaDir: string,
): { ok: true; catalog: EvergreenCatalog } | Fail {
  let names: string[];
  try {
    names = readdirSync(catalogDir)
      .filter((n) => n.endsWith(".json"))
      .sort();
  } catch {
    return fail(`cannot read ${catalogDir}`);
  }
  const entries: EvergreenEntry[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(catalogDir, name), "utf8"));
    } catch {
      return fail(`${name}: bad JSON`);
    }
    const unwrap =
      parsed && typeof parsed === "object" && "entries" in parsed
        ? parsed
        : { version: 1, entries: [parsed] };
    const v = validateEvergreenCatalog(unwrap, mediaDir);
    if (!v.ok) return fail(`${name}: ${v.error}`);
    for (const entry of v.catalog.entries) {
      if (seen.has(entry.id)) return fail(`duplicate ${entry.id}`);
      seen.add(entry.id);
      entries.push(entry);
    }
  }
  if (!entries.length) return fail("catalog empty");
  return { ok: true, catalog: { version: 1, entries } };
}
