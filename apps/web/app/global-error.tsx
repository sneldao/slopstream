"use client";

/**
 * Last line of defence: a crash inside the root layout itself leaves nowhere
 * else to render, so this boundary has to supply its own document shell.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: "48px 24px",
          background: "#080812",
          color: "#fffdf6",
          font: "15px/1.55 ui-sans-serif, -apple-system, 'Helvetica Neue', sans-serif",
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 12px" }}>
          Slopstream could not load
        </h1>
        <p style={{ margin: "0 0 24px", opacity: 0.64 }}>
          A problem in the page shell stopped anything else from rendering.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: 0,
            borderRadius: 999,
            padding: "14px 24px",
            background: "#ffe45e",
            color: "#101014",
            font: "inherit",
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
