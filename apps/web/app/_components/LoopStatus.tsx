"use client";

import { LOOP_STEPS, deriveLoopPhase, type LoopPhase } from "@/lib/loopPhase";
import type { StreamState } from "@/lib/streamReducer";

const PHASE_HINT: Record<LoopPhase, string> = {
  bid: "Brands compete for the next slot",
  play: "The winning ad is on air",
  prove: "Listeners answer attention checks",
  clear: "Verified attention unlocks the pool",
};

/**
 * Tiny shared stepper: Bid → Play → Prove → Clear.
 * Hints are optional — screen-only by default so Listen/Brand stay quiet.
 */
export function LoopStatus({
  state,
  tone = "dark",
  className = "",
  showHint = false,
}: {
  state: StreamState;
  tone?: "light" | "dark";
  className?: string;
  /** Sentence under the stepper — keep for spectacle, off for phone/cockpit. */
  showHint?: boolean;
}) {
  const phase = deriveLoopPhase(state);

  return (
    <div
      className={`slop-loop-status slop-loop-status--${tone}${className ? ` ${className}` : ""}`}
      role="status"
      aria-label={`Market loop: ${phase}`}
    >
      <ol className="slop-loop-status__steps">
        {LOOP_STEPS.map((step, index) => {
          const active = step.id === phase;
          const done = LOOP_STEPS.findIndex((s) => s.id === phase) > index;
          return (
            <li
              key={step.id}
              className={[
                "slop-loop-status__step",
                active ? "is-active" : "",
                done ? "is-done" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="slop-loop-status__dot" aria-hidden />
              <span className="slop-loop-status__label">{step.label}</span>
            </li>
          );
        })}
      </ol>
      {showHint ? (
        <p className="slop-loop-status__hint">{PHASE_HINT[phase]}</p>
      ) : null}
    </div>
  );
}
