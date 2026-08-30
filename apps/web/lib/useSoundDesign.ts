"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Sound design — synthesized via Web Audio API, no audio files.
 *
 * Every signature moment gets a sound: OUTBID crack, clearing chime,
 * challenge pop, proof seal stamp, bid placed click. Sounds are
 * synthesized oscillators with envelopes — cheap, instant, no loading.
 *
 * Call `useSoundDesign()` once in the screen root, then use the returned
 * `play` function. Audio context is created lazily on first user gesture
 * (browser autoplay policy) — the demo controls' first click unlocks it.
 */

type SoundName =
  "outbid" | "clear" | "challenge" | "proof" | "bid" | "join" | "unclear";

export function useSoundDesign() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureContext = useCallback(() => {
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) ctxRef.current = new Ctor();
    }
    if (ctxRef.current?.state === "suspended") {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const play = useCallback(
    (name: SoundName) => {
      const ctx = ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      switch (name) {
        case "outbid": {
          // Sharp crack — noise burst + descending tone.
          playNoiseBurst(ctx, now, 0.15, 0.4);
          playTone(ctx, now, 220, 110, 0.3, "sawtooth", 0.2);
          playTone(ctx, now + 0.05, 440, 220, 0.2, "square", 0.1);
          break;
        }
        case "clear": {
          // Rising chime — ascending major triad.
          playTone(ctx, now, 523.25, 523.25, 0.6, "sine", 0.15); // C5
          playTone(ctx, now + 0.08, 659.25, 659.25, 0.5, "sine", 0.12); // E5
          playTone(ctx, now + 0.16, 783.99, 783.99, 0.8, "sine", 0.15); // G5
          playTone(ctx, now + 0.24, 1046.5, 1046.5, 1.0, "sine", 0.1); // C6
          break;
        }
        case "challenge": {
          // Playful pop — quick rising sine.
          playTone(ctx, now, 400, 800, 0.15, "sine", 0.15);
          break;
        }
        case "proof": {
          // Seal stamp — low thud + bright shimmer.
          playTone(ctx, now, 150, 80, 0.2, "sine", 0.2);
          playTone(ctx, now + 0.05, 1200, 1200, 0.4, "sine", 0.08);
          playTone(ctx, now + 0.1, 1600, 1600, 0.3, "sine", 0.05);
          break;
        }
        case "bid": {
          // Click — short percussive blip.
          playTone(ctx, now, 800, 600, 0.05, "square", 0.08);
          break;
        }
        case "join": {
          // Welcome — soft rising sweep.
          playTone(ctx, now, 300, 600, 0.3, "sine", 0.1);
          break;
        }
        case "unclear": {
          // Somber — descending minor.
          playTone(ctx, now, 440, 440, 0.3, "sine", 0.12);
          playTone(ctx, now + 0.15, 349.23, 349.23, 0.5, "sine", 0.1);
          break;
        }
      }
    },
    [ensureContext],
  );

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      ctxRef.current?.close();
    };
  }, []);

  return { play, ensureContext };
}

function playTone(
  ctx: AudioContext,
  start: number,
  fromFreq: number,
  toFreq: number,
  duration: number,
  type: OscillatorType,
  gain: number,
) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fromFreq, start);
  if (toFreq !== fromFreq) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(toFreq, 1),
      start + duration,
    );
  }
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + 0.01);
  env.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function playNoiseBurst(
  ctx: AudioContext,
  start: number,
  duration: number,
  gain: number,
) {
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.001, start + duration);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 800;
  source.connect(filter);
  filter.connect(env);
  env.connect(ctx.destination);
  source.start(start);
}
