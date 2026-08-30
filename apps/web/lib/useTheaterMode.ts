"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Presentation theater mode for the big screen.
 * `?theater=1` starts hidden; `T` toggles; URL updates without reload.
 */
export function useTheaterMode(enabled = true) {
  const [theater, setTheater] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("theater") === "1") setTheater(true);
  }, [enabled]);

  const apply = useCallback(
    (next: boolean) => {
      setTheater(next);
      if (!enabled) return;
      const url = new URL(window.location.href);
      if (next) url.searchParams.set("theater", "1");
      else url.searchParams.delete("theater");
      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    },
    [enabled],
  );

  const toggle = useCallback(() => apply(!theater), [apply, theater]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setTheater((v) => {
          const next = !v;
          const url = new URL(window.location.href);
          if (next) url.searchParams.set("theater", "1");
          else url.searchParams.delete("theater");
          window.history.replaceState(
            {},
            "",
            `${url.pathname}${url.search}${url.hash}`,
          );
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  return { theater, setTheater: apply, toggle };
}
