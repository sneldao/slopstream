/**
 * Build-time stream mode switch. `NEXT_PUBLIC_STREAM_MODE` is inlined by
 * Next at build time, so this is a plain function (no hooks) that both
 * server and client modules can call. Single source of truth — do not
 * re-derive the env check elsewhere.
 */

export type StreamMode = "demo" | "live";

export function getStreamMode(): StreamMode {
  return process.env.NEXT_PUBLIC_STREAM_MODE === "live" ? "live" : "demo";
}
