"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * The shared audio signal — the heartbeat of the living canvas.
 *
 * Two modes:
 * 1. **Real audio** — when `audioUrl` is provided, creates a hidden
 *    `<audio>` element, connects it to a Web Audio `AnalyserNode`, and
 *    drives the signal from real frequency data. This is used in live mode
 *    when the ElevenLabs generator produces real TTS audio.
 * 2. **Synthesized** — when no `audioUrl` is provided (stream between
 *    segments or audio-only fallback), synthesizes an organic amplitude
 *    signal from layered sines + noise.
 *
 * Returns a ref to a shared `AudioSignal` object (amplitude, bass, mid,
 * treble, beat) that visual components read on each animation frame. Using
 * a ref avoids re-renders — the signal updates at 60fps via rAF.
 */

export interface AudioSignal {
  /** Overall amplitude 0..1 — the "loudness" right now. */
  amplitude: number;
  /** Low-frequency energy 0..1 — bass / beat. */
  bass: number;
  /** Mid-frequency energy 0..1 — voice presence. */
  mid: number;
  /** High-frequency energy 0..1 — sparkle / texture. */
  treble: number;
  /** Beat detection — pulses to 1 on a detected beat, decays to 0. */
  beat: number;
  /** Smoothed amplitude for gentle reactions (lagging). */
  smoothAmplitude: number;
}

function createEmptySignal(): AudioSignal {
  return {
    amplitude: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    beat: 0,
    smoothAmplitude: 0,
  };
}

export type AudioPlaybackState =
  "idle" | "loading" | "playing" | "degraded" | "ended";

export function useAudioSignal(
  active: boolean,
  audioUrl?: string,
  startedAt?: string,
) {
  const signalRef = useRef<AudioSignal>(createEmptySignal());
  const rafRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const lastBeatRef = useRef(0);
  const beatEnergyRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playbackState, setPlaybackState] =
    useState<AudioPlaybackState>("idle");
  const mutedRef = useRef(false);
  const canPlayRef = useRef(false);
  const playRef = useRef<() => void>(() => {});

  // Web Audio nodes for real audio analysis.
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    mutedRef.current = muted;
    if (audioElRef.current) audioElRef.current.muted = muted;
  }, [muted]);

  // Set up real audio when an audioUrl is provided.
  useEffect(() => {
    if (!audioUrl) {
      setPlaybackState("idle");
      canPlayRef.current = false;
      playRef.current = () => {};
      // Tear down any existing real audio.
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      analyserRef.current = null;
      freqDataRef.current = null;
      return;
    }

    // Create audio element.
    const audio = new Audio();
    audio.src = audioUrl;
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.loop = false;
    audio.muted = mutedRef.current;
    canPlayRef.current = false;
    setPlaybackState("loading");
    audioElRef.current = audio;

    // Create AudioContext + AnalyserNode.
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    analyserRef.current = analyser;
    freqDataRef.current = new Uint8Array(
      new ArrayBuffer(analyser.frequencyBinCount),
    ) as Uint8Array<ArrayBuffer>;

    try {
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
    } catch {
      // CORS or autoplay restrictions — fall back to synthesized signal.
      analyserRef.current = null;
    }

    // Synchronize a late join/reconnect to the server-owned clock once the
    // file has metadata. The scheduler remains authoritative for settlement;
    // this only prevents a local listener from replaying the ad from zero.
    const syncToLivePosition = () => {
      if (!startedAt || !Number.isFinite(audio.duration)) return;
      const elapsedSec = Math.max(
        0,
        (Date.now() - Date.parse(startedAt)) / 1000,
      );
      if (elapsedSec < audio.duration - 0.25) {
        try {
          audio.currentTime = elapsedSec;
        } catch {
          // Seeking remains best-effort for media served without ranges.
        }
      }
    };
    const startPlayback = () => {
      if (!active || !canPlayRef.current) return;
      syncToLivePosition();
      if (ctx.state === "suspended") void ctx.resume();
      void audio.play().catch(() => {
        // A user gesture can retry this through unlock/pointerdown.
      });
    };
    const onCanPlay = () => {
      canPlayRef.current = true;
      startPlayback();
    };
    const onPlaying = () => setPlaybackState("playing");
    const onError = () => setPlaybackState("degraded");
    const onEnded = () => setPlaybackState("ended");
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);
    playRef.current = startPlayback;
    audio.load();
    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) onCanPlay();

    // Retry on any pointerdown until the first successful resume, so audio
    // keeps surviving ad changes on mobile. The listener is lightweight and
    // removed as soon as both the context and the element are running (and
    // always on cleanup).
    const onPointerDown = () => {
      startPlayback();
      if (ctx.state !== "suspended" && !audio.paused) {
        document.removeEventListener("pointerdown", onPointerDown);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
      canPlayRef.current = false;
      playRef.current = () => {};
      audio.pause();
      audio.src = "";
      audioElRef.current = null;
      ctx.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
      freqDataRef.current = null;
    };
  }, [active, audioUrl, startedAt]);

  const tick = useCallback(() => {
    const phase = phaseRef.current;
    phaseRef.current = phase + 0.016;

    // Try real audio analysis first.
    const analyser = analyserRef.current;
    const freqData = freqDataRef.current;
    if (active && analyser && freqData) {
      analyser.getByteFrequencyData(freqData);

      // Map frequency bins to bass / mid / treble.
      // fftSize=256 → 128 bins. Bass: 0-8, Mid: 8-32, Treble: 32-64.
      const bins = freqData.length;
      let bassSum = 0,
        midSum = 0,
        trebleSum = 0;
      const bassEnd = Math.max(1, Math.floor(bins * 0.06));
      const midEnd = Math.max(bassEnd + 1, Math.floor(bins * 0.25));
      const trebleEnd = Math.max(midEnd + 1, Math.floor(bins * 0.5));

      for (let i = 0; i < bassEnd; i++) bassSum += freqData[i];
      for (let i = bassEnd; i < midEnd; i++) midSum += freqData[i];
      for (let i = midEnd; i < trebleEnd; i++) trebleSum += freqData[i];

      const bass = bassSum / (bassEnd * 255);
      const mid = midSum / ((midEnd - bassEnd) * 255);
      const treble = trebleSum / ((trebleEnd - midEnd) * 255);
      const amp = bass * 0.5 + mid * 0.3 + treble * 0.2;

      // Beat detection — bass energy spike.
      const bassDelta = bass - beatEnergyRef.current;
      beatEnergyRef.current = bass;
      let beat = signalRef.current.beat * 0.85;
      if (bassDelta > 0.12 && phase - lastBeatRef.current > 0.25) {
        beat = 1;
        lastBeatRef.current = phase;
      }

      const prevSmooth = signalRef.current.smoothAmplitude;
      signalRef.current = {
        amplitude: Math.max(0, Math.min(1, amp)),
        bass: Math.max(0, Math.min(1, bass)),
        mid: Math.max(0, Math.min(1, mid)),
        treble: Math.max(0, Math.min(1, treble)),
        beat,
        smoothAmplitude: prevSmooth + (amp - prevSmooth) * 0.08,
      };
    } else if (active) {
      // Synthesized organic amplitude — layered sines + noise.
      const bass =
        0.4 + 0.3 * Math.sin(phase * 0.8) + 0.15 * Math.sin(phase * 2.1);
      const mid =
        0.35 + 0.25 * Math.sin(phase * 1.3 + 0.5) + 0.1 * Math.sin(phase * 3.7);
      const treble =
        0.2 + 0.15 * Math.sin(phase * 4.2 + 1.0) + 0.1 * Math.sin(phase * 7.1);
      const amp = bass * 0.5 + mid * 0.3 + treble * 0.2;

      const bassDelta = bass - beatEnergyRef.current;
      beatEnergyRef.current = bass;
      let beat = signalRef.current.beat * 0.85;
      if (bassDelta > 0.15 && phase - lastBeatRef.current > 0.3) {
        beat = 1;
        lastBeatRef.current = phase;
      }

      const prevSmooth = signalRef.current.smoothAmplitude;
      signalRef.current = {
        amplitude: Math.max(0, Math.min(1, amp)),
        bass: Math.max(0, Math.min(1, bass)),
        mid: Math.max(0, Math.min(1, mid)),
        treble: Math.max(0, Math.min(1, treble)),
        beat,
        smoothAmplitude: prevSmooth + (amp - prevSmooth) * 0.08,
      };
    } else {
      // Calm — everything decays toward 0.
      const s = signalRef.current;
      signalRef.current = {
        amplitude: s.amplitude * 0.92,
        bass: s.bass * 0.92,
        mid: s.mid * 0.92,
        treble: s.treble * 0.92,
        beat: s.beat * 0.85,
        smoothAmplitude: s.smoothAmplitude * 0.95,
      };
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [active]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    setReady(true);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  /** Resume AudioContext + play the media element after a user gesture. */
  const unlock = useCallback(() => {
    playRef.current();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => !m);
    // The mute control is a user gesture, so it can also unlock a newly
    // ready source without bypassing the canplay gate.
    playRef.current();
  }, []);

  return {
    signalRef,
    ready,
    playbackState,
    unlock,
    muted,
    toggleMute,
    setMuted,
  };
}
