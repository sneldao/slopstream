/**
 * Canonical listener join URL for the big-screen QR code.
 * Always opts into earn mode so the demo arc starts on the reward path.
 */
export function listenerJoinUrl(origin?: string): string {
  const configured = process.env.NEXT_PUBLIC_LISTENER_URL;
  const base =
    configured ??
    (origin
      ? `${origin.replace(/\/$/, "")}/listen`
      : "http://localhost:3000/listen");
  const url = new URL(base);
  url.searchParams.set("earn", "1");
  return url.toString();
}
