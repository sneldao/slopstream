"use client";

import { useEffect, useMemo, useState } from "react";
import type { Segment } from "@slopstream/shared";

export type MediaPreloadKind = "audio" | "image" | "video";
export type MediaPreloadState = "loading" | "ready" | "degraded";

export interface MediaPreloadPlan {
  key: string;
  kind: MediaPreloadKind;
  url: string;
}

/**
 * Returns distinct immutable derivatives for the next queue entries. Legacy
 * assetUrl values are deliberately excluded: new playback warms only the
 * explicit, manifest-declared assets that passed the API trust boundary.
 */
export function mediaPreloadPlans(
  segments: readonly Segment[],
  segmentLimit = 2,
): MediaPreloadPlan[] {
  const plans: MediaPreloadPlan[] = [];
  const seen = new Set<string>();
  for (const segment of segments.slice(0, segmentLimit)) {
    const media = segment.media;
    if (!media) continue;
    const assets: MediaPreloadPlan[] = [
      {
        key: `audio:${media.audio.sha256}`,
        kind: "audio",
        url: media.audio.url,
      },
      ...(media.visual
        ? [
            {
              key: `${media.visual.type}:${media.visual.sha256}`,
              kind: media.visual.type,
              url: media.visual.url,
            } satisfies MediaPreloadPlan,
          ]
        : []),
    ];
    for (const asset of assets) {
      if (!seen.has(asset.key)) {
        seen.add(asset.key);
        plans.push(asset);
      }
    }
  }
  return plans;
}

/**
 * Warm the next two manifest-declared media items without influencing the
 * shared stream clock. A local failure only marks this client degraded; the
 * existing current item and scheduler-owned encore remain authoritative.
 */
export function useMediaPreload(
  segments: readonly Segment[],
): Readonly<Record<string, MediaPreloadState>> {
  const plan = useMemo(() => mediaPreloadPlans(segments), [segments]);
  const planKey = plan.map((asset) => asset.key).join("|");
  const [states, setStates] = useState<Record<string, MediaPreloadState>>({});

  useEffect(() => {
    if (plan.length === 0) return;
    let cancelled = false;
    const cleanup: Array<() => void> = [];
    setStates((previous) =>
      Object.fromEntries(
        plan.map((asset) => [asset.key, previous[asset.key] ?? "loading"]),
      ),
    );

    const settle = (key: string, state: MediaPreloadState) => {
      if (cancelled) return;
      setStates((previous) => ({ ...previous, [key]: state }));
    };

    for (const asset of plan) {
      if (asset.kind === "image") {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
          void image.decode().catch(() => {});
          settle(asset.key, "ready");
        };
        image.onerror = () => settle(asset.key, "degraded");
        image.src = asset.url;
        cleanup.push(() => {
          image.onload = null;
          image.onerror = null;
          image.src = "";
        });
        continue;
      }

      const element = document.createElement(
        asset.kind === "audio" ? "audio" : "video",
      );
      element.preload = asset.kind === "audio" ? "auto" : "metadata";
      element.muted = true;
      const ready = () => settle(asset.key, "ready");
      const failed = () => settle(asset.key, "degraded");
      element.addEventListener("canplay", ready, { once: true });
      element.addEventListener("error", failed, { once: true });
      element.src = asset.url;
      element.load();
      cleanup.push(() => {
        element.removeEventListener("canplay", ready);
        element.removeEventListener("error", failed);
        element.removeAttribute("src");
        element.load();
      });
    }

    return () => {
      cancelled = true;
      for (const dispose of cleanup) dispose();
    };
  }, [plan, planKey]);

  return states;
}
