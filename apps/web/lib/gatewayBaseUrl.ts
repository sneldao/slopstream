/** HTTP base for the orchestrator gateway (snapshot, ops metrics, WS sibling). */
export function gatewayBaseUrl(): string {
  const ws = process.env.NEXT_PUBLIC_WS_URL;
  if (ws) return ws.replace(/^ws/i, "http");
  if (typeof window !== "undefined") return window.location.origin;
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    ""
  );
}
