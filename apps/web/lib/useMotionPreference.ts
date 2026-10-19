"use client";

import { useEffect, useState } from "react";

/**
 * Non-hook read for canvas/rAF effects that already re-run on a dependency
 * change and only need the value at setup time.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Live `prefers-reduced-motion` signal for the JS-driven animation layers.
 *
 * Framer Motion honours the preference through `MotionConfig reducedMotion`
 * and CSS through the global reset, but the rAF loops that drive the
 * Continuum write CSS variables and paint canvases directly — nothing in the
 * declarative layer can stop those. They subscribe here instead.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}

/**
 * Paint the active brand's palette onto the root so CSS and canvas layers
 * share one source of truth. `null`/`undefined` restores the platform
 * defaults, which is what empty-market and loading frames should look like.
 */
export function useBrandPalette(
  brand: { primaryColor: string; secondaryColor: string } | null | undefined,
) {
  useEffect(() => {
    const root = document.documentElement;
    if (brand) {
      root.style.setProperty("--brand-primary", brand.primaryColor);
      root.style.setProperty("--brand-secondary", brand.secondaryColor);
      root.style.setProperty("--brand-glow", `${brand.primaryColor}33`);
    } else {
      root.style.setProperty("--brand-primary", "var(--platform-bg-2)");
      root.style.setProperty("--brand-secondary", "var(--platform-bg-1)");
      root.style.setProperty("--brand-glow", "rgba(255,215,106,0.18)");
    }
  }, [brand]);
}
