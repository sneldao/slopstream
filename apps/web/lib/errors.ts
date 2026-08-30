/**
 * Render-safe extraction of an error message. Unknown throwables fall back
 * to the supplied default so the UI never displays "[object Object]".
 */
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong.",
): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
