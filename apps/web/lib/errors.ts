/**
 * Render-safe extraction of an error message. Unknown throwables fall back
 * to the supplied default so the UI never displays "[object Object]".
 */
/**
 * The strings browsers throw when a fetch never reached the server — each
 * engine words it differently, and none of them are worth showing a user.
 */
const NETWORK_FAILURES = new Set([
  "failed to fetch", // Chrome
  "load failed", // Safari
  "networkerror when attempting to fetch resource.", // Firefox
]);

function isNetworkFailure(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    NETWORK_FAILURES.has(normalized) || normalized.startsWith("net::err_") // Chrome's coded variants
  );
}

export function errorMessage(
  error: unknown,
  fallback = "Something went wrong.",
): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  // Server-side errors arrive as Error too, and their text is the useful part;
  // only a request that never landed gets replaced by the caller's own copy.
  return isNetworkFailure(error.message) ? fallback : error.message;
}
