"use client";

import { useEffect } from "react";
import { SurfaceHeader } from "./_components/SurfaceHeader";

/**
 * Route boundary for every surface. The stream is live and the generator is
 * external — a render crash here is a real possibility, and without this the
 * whole app falls back to the browser's blank error page.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[slopstream] route error", error);
  }, [error]);

  return (
    <main className="slop-surface-shell has-dock">
      <SurfaceHeader subtitle="Stream" tone="dark" />
      <div className="slop-stop">
        <span className="slop-kicker" style={{ color: "var(--slop-coral)" }}>
          Something broke
        </span>
        <h1 className="slop-stop__title">This frame crashed</h1>
        <p className="slop-stop__body">
          The stream keeps running server-side — retry to catch up with the live
          segment rather than reloading the whole page.
        </p>
        <div className="slop-stop__actions">
          <button type="button" className="slop-stop__primary" onClick={reset}>
            Try again
          </button>
          <a href="/">Back to the stream</a>
        </div>
        {error.digest && (
          <p className="slop-stop__detail">Reference: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
