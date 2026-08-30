"use client";

/** Resolve the documented API URL while accepting the legacy alias briefly. */
export function apiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    ""
  );
}

export function apiUrl(path: string): string {
  return `${apiBaseUrl()}${path}`;
}

/** Shared request deadline — long enough for a slow gateway, short enough
 *  that a stalled UI retry isn't left hanging on a dead connection. */
const REQUEST_TIMEOUT_MS = 10_000;

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  // Bodyless requests must not claim a JSON payload — some gateways reject
  // GETs that carry a Content-Type.
  if (method !== "GET" && method !== "HEAD") {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Request timed out.");
    }
    throw error;
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Request failed (${response.status})`,
    );
  }
  return (await response.json()) as T;
}
