"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * The shared audio signal — the heartbeat of the living canvas.
 *
 * Until a shared media element is connected, synthesizes an organic amplitude signal
 * from a mix of sine waves + noise, modulated by whether a segment is
 * "playing." This gives every visual surface a real signal to react to
 * without needing actual audio.
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

export function useAudioSignal(active: boolean) {
  const signalRef = useRef<AudioSignal>(createEmptySignal());
  const rafRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const lastBeatRef = useRef(0);
  const beatEnergyRef = useRef(0);
  const [ready, setReady] = useState(false);

  const tick = useCallback(() => {
    const phase = phaseRef.current;
    phaseRef.current = phase + 0.016;

    if (active) {
      // Synthesized organic amplitude — layered sines + noise.
      // Voice-like mid frequencies pulse slower than treble sparkle.
      const bass =
        0.4 + 0.3 * Math.sin(phase * 0.8) + 0.15 * Math.sin(phase * 2.1);
      const mid =
        0.35 + 0.25 * Math.sin(phase * 1.3 + 0.5) + 0.1 * Math.sin(phase * 3.7);
      const treble =
        0.2 + 0.15 * Math.sin(phase * 4.2 + 1.0) + 0.1 * Math.sin(phase * 7.1);
      const amp = bass * 0.5 + mid * 0.3 + treble * 0.2;

      // Beat detection — when bass energy spikes above a threshold.
      const bassDelta = bass - beatEnergyRef.current;
      beatEnergyRef.current = bass;
      let beat = signalRef.current.beat * 0.85; // decay
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

  return { signalRef, ready };
}
