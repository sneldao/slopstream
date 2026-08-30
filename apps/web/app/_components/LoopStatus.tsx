"use client";

import { LOOP_STEPS, deriveLoopPhase } from "@/lib/loopPhase";
import type { StreamState } from "@/lib/streamReducer";

/**
 * Tiny shared stepper: Bid → Play → Prove → Clear.
 */
export function LoopStatus({
  state,
  tone = "dark",
  className = "",
}: {
  state: StreamState;
  tone?: "light" | "dark";
  className?: string;
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
    </div>
  );
}
