"use client";

/**
 * Demo player — drives the UI from a `DemoFixture` with no live backend.
 *
 * The player renders `initialSnapshot` as authoritative state, then walks
 * `steps` in order: for each step it (optionally) resets state to `snapshot`,
 * applies `delivery` through the stream reducer, then waits `delayMsAfter`
 * before advancing. The code path mirrors a live WebSocket client — swap the
 * fixture for `GET /stream/snapshot` + a socket feed and the reducer + state
 * shape are identical.
 *
 * Controls: play / pause / restart / step manually. While paused, `stepNext`
 * advances one step without arming a timer; `play` resumes from the current
 * index.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DemoFixture } from "@slopstream/shared";
import {
  reduceStreamEvent,
  snapshotToState,
  type StreamState,
} from "./streamReducer";

export interface DemoPlayer {
  state: StreamState;
  stepIndex: number;
  totalSteps: number;
  playing: boolean;
  finished: boolean;
  label?: string;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  stepNext: () => void;
}

function applyStep(
  state: StreamState,
  step: DemoFixture["steps"][number],
): StreamState {
  let s = step.snapshot ? snapshotToState(step.snapshot) : state;
  if (step.delivery) {
    s = reduceStreamEvent(s, step.delivery.event, step.delivery.sequence);
  }
  return s;
}

export function useDemoPlayer(fixture: DemoFixture): DemoPlayer {
  const initial = useMemo(
    () => snapshotToState(fixture.initialSnapshot),
    [fixture],
  );
  const [state, setState] = useState<StreamState>(initial);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [label, setLabel] = useState<string | undefined>(undefined);

  const totalSteps = fixture.steps.length;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);
  const playingRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advance = useCallback(
    (run: boolean) => {
      clearTimer();
      const idx = indexRef.current;
      if (idx >= totalSteps) {
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      const step = fixture.steps[idx];
      setState((prev) => applyStep(prev, step));
      setLabel(step.label);
      indexRef.current = idx + 1;
      setStepIndex(idx + 1);

      if (!run) return;
      const delay = step.delayMsAfter ?? 0;
      timerRef.current = setTimeout(() => advance(true), Math.max(delay, 0));
    },
    [clearTimer, fixture.steps, totalSteps],
  );

  // Autoplay from the start on mount.
  useEffect(() => {
    indexRef.current = 0;
    playingRef.current = true;
    advance(true);
    return clearTimer;
  }, [advance, clearTimer]);

  const play = useCallback(() => {
    if (indexRef.current >= totalSteps) return;
    playingRef.current = true;
    setPlaying(true);
    advance(true);
  }, [advance, totalSteps]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    clearTimer();
  }, [clearTimer]);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

  const restart = useCallback(() => {
    clearTimer();
    indexRef.current = 0;
    playingRef.current = true;
    setState(initial);
    setLabel(undefined);
    setStepIndex(0);
    setPlaying(true);
    advance(true);
  }, [advance, clearTimer, initial]);

  const stepNext = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    advance(false);
  }, [advance]);

  return {
    state,
    stepIndex,
    totalSteps,
    playing,
    finished: stepIndex >= totalSteps,
    label,
    play,
    pause,
    toggle,
    restart,
    stepNext,
  };
}
