export type SceneRecipe =
  "editorial" | "orbit" | "cascade" | "constellation" | "cinema";

export type ContinuumAssetType = "image" | "video" | "audio";

export interface SceneRecipeInput {
  segmentId?: string;
  assetUrl?: string;
  generationId?: string;
  latestArchiveId?: string;
}

/** Stable recipe selection keeps a segment's visual identity across reloads. */
export function selectSceneRecipe(input: SceneRecipeInput): SceneRecipe {
  if (input.segmentId && continuumAssetType(input.assetUrl) === "video") {
    return "cinema";
  }

  const seed =
    input.segmentId ?? input.generationId ?? input.latestArchiveId ?? "open";
  const candidates: SceneRecipe[] = input.assetUrl
    ? ["editorial", "orbit", "cascade", "constellation"]
    : input.generationId
      ? ["cascade", "orbit", "editorial"]
      : ["constellation", "orbit", "editorial"];
  return candidates[stableHash(seed) % candidates.length] ?? "editorial";
}

export function continuumAssetType(url?: string): ContinuumAssetType {
  if (!url) return "audio";
  const clean = url.split(/[?#]/)[0]?.toLowerCase() ?? "";
  if (/\.(mp4|webm|mov|m4v)$/.test(clean)) return "video";
  if (/\.(png|jpe?g|webp|gif|avif)$/.test(clean)) return "image";
  return "audio";
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
