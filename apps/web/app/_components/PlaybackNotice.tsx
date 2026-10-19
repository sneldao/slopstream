"use client";

import type { AudioPlaybackState } from "@/lib/useAudioSignal";

/**
 * Audio failure is otherwise invisible: the stream keeps advancing on the
 * server clock while the viewer watches a silent screen. `useAudioSignal`
 * already reports `degraded`; this turns it into something actionable.
 *
 * `ended` is deliberately not surfaced — between segments the next asset is
 * already loading, so treating it as an error would cry wolf.
 */
export function PlaybackNotice({
  playbackState,
  muted,
  onRetry,
  className,
  style,
  dot,
}: {
  playbackState: AudioPlaybackState;
  muted: boolean;
  onRetry: () => void;
  className?: string;
  style?: React.CSSProperties;
  dot?: React.ReactNode;
}) {
  if (muted || playbackState !== "degraded") return null;

  return (
    <div className={className ?? "screen-notice"} style={style} role="alert">
      {dot}
      <span>The stream audio stalled.</span>
      <button type="button" onClick={onRetry}>
        Tap to restore sound
      </button>
    </div>
  );
}
