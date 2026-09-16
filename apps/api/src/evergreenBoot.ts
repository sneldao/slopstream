// Evergreen boot: durable catalog reseed (docs/product/evergreen-loop.md Stage 1).
// Reads one-JSON-per-entry catalog files, byte-verifies every declared media
// file, and derives deterministic reseed brands so airings survive restarts.
// Missing/partial config and unreadable bytes are fail-closed: the caller
// refuses to boot rather than airing the wrong catalog.
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { isPublicMediaUrl } from "@slopstream/shared";
import { isoNow, newToken } from "./ids.js";
import type { BrandRow } from "./ledger.js";
import type { EvergreenStore } from "./evergreenRotation.js";
import { loadEvergreenCatalogDir as loadEntries } from "./evergreenValidate.js";

export interface EvergreenBootBrand {
  id: string;
  row: BrandRow;
}

export interface EvergreenBoot {
  store: EvergreenStore;
  mediaDir: string;
  brands: EvergreenBootBrand[];
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Deterministic display palette per catalog brandId (reseed-stable). */
export function evergreenBrandPalette(brandId: string): {
  primaryColor: string;
  secondaryColor: string;
} {
  const digest = createHash("sha256").update(brandId).digest("hex");
  const hue = parseInt(digest.slice(0, 4), 16) % 360;
  const hue2 = (hue + 40) % 360;
  return {
    primaryColor: `hsl(${hue} 70% 50%)`,
    secondaryColor: `hsl(${hue2} 70% 65%)`,
  };
}

export function loadEvergreenCatalogDir(opts: {
  catalogDir?: string;
  mediaDir?: string;
  assetBaseUrl?: string;
  thresholdFraction?: number;
}):
  | {
      ok: true;
      store: EvergreenStore;
      mediaDir: string;
      brands: EvergreenBootBrand[];
    }
  | { ok: false; error: string } {
  const { catalogDir, mediaDir, assetBaseUrl } = opts;
  if (!catalogDir || !mediaDir || !assetBaseUrl) {
    return fail(
      "evergreen misconfigured: set EVERGREEN_CATALOG_DIR, EVERGREEN_MEDIA_DIR, and EVERGREEN_ASSET_BASE_URL together",
    );
  }
  if (!isPublicMediaUrl(assetBaseUrl)) {
    return fail(
      "evergreen misconfigured: EVERGREEN_ASSET_BASE_URL must be public queryless HTTPS",
    );
  }
  const resolvedMediaDir = resolve(mediaDir);
  const loaded = loadEntries(catalogDir, resolvedMediaDir);
  if (!loaded.ok) return fail(`evergreen catalog invalid: ${loaded.error}`);
  const thresholdFraction = opts.thresholdFraction ?? 0.6;
  const store: EvergreenStore = {
    entries: loaded.catalog.entries,
    assetBaseUrl: assetBaseUrl.replace(/\/$/, ""),
    states: new Map(),
    thresholdFraction,
  };
  const brands = new Map<string, EvergreenBootBrand>();
  for (const entry of loaded.catalog.entries) {
    if (!brands.has(entry.brandId)) {
      const palette = evergreenBrandPalette(entry.brandId);
      const row: BrandRow = {
        id: entry.brandId,
        name: entry.brandId,
        primaryColor: palette.primaryColor,
        secondaryColor: palette.secondaryColor,
        brief: entry.brief,
        token: newToken(),
        createdAt: isoNow(),
      };
      brands.set(entry.brandId, { id: entry.brandId, row });
    }
  }
  return {
    ok: true,
    store,
    mediaDir: resolvedMediaDir,
    brands: [...brands.values()],
  };
}
