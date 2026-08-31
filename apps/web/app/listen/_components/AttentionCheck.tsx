"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { PublicChallenge } from "@slopstream/shared";

const ANSWER_WASH = ["#ffe45e", "#45a7ff", "#ff7a66", "#b8ff65"];

/**
 * The attention check — full-bleed, no card.
 *
 * This replaces the previous ChallengeCard, which drew a bordered cream box
 * inside the listener's document-flow column: a bounded rectangle inside a
 * bounded rectangle, on the one device where vertical space is the scarce
 * resource. It also carried a pointer-parallax tilt that barely fires on a
 * touch screen — effort spent making a card feel less like a card, which is
 * the signal to remove the card instead.
 *
 * What does the card's four jobs now:
 *   · group     — an edge-to-edge veil; the check owns the whole viewport
 *   · separate  — rules between answer rows, not a box around each
 *   · rank      — the question is simply the largest type on the surface
 *   · hit target— the answer row spans the viewport at >= 62px tall
 *
 * Deliberate constraints:
 *   · Content sits at the bottom of the veil, where the gradient is densest
 *     (>= 0.96 opaque). Contrast is guaranteed rather than hoped for, and the
 *     answers land in thumb reach.
 *   · DOM order is reading order: label, countdown, question, answers.
 *   · Confirmation is a clip wash whose reverse is faster and eased in, not
 *     the entrance played backwards (see --dur-exit / --ease-in-quick).
 *   · All motion goes through Framer Motion or CSS transitions, so the app's
 *     MotionConfig reducedMotion="user" and the global reduced-motion reset
 *     both apply. Every resting state is readable with motion disabled.
 */
export function AttentionCheck({
  challenge,
  brandColor,
  onAnswer,
  onExpired,
  nowPlayingStartedAt,
}: {
  challenge: PublicChallenge;
  brandColor: string;
  onAnswer: (answer: string) => void | Promise<void>;
  /** Called when the listener dismisses an expired challenge. */
  onExpired?: () => void;
  /**
   * ISO timestamp the current segment started playing. `validFrom`/`validUntil`
   * are seconds-from-segment-start, so a late joiner must subtract the elapsed
   * playback time or they see the full window instead of what's left. When
   * absent, fall back to counting the whole window down from mount.
   */
  nowPlayingStartedAt?: string;
}) {
  const windowSec = challenge.validUntil - challenge.validFrom;
  const startedAtMs = nowPlayingStartedAt
    ? Date.parse(nowPlayingStartedAt)
    : Number.NaN;
  const hasClock = Number.isFinite(startedAtMs);

  // Remaining time from the real playback clock, clamped to the window so the
  // bar never overflows for an (edge-case) early render.
  const remainingFromClock = () => {
    const elapsed = (Date.now() - startedAtMs) / 1000;
    return Math.max(0, Math.min(challenge.validUntil - elapsed, windowSec));
  };

  const [remaining, setRemaining] = useState(() =>
    hasClock ? remainingFromClock() : windowSec,
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const onExpiredRef = useRef(onExpired);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  // Move focus to the check when it interrupts, so a keyboard or screen
  // reader user is told what happened instead of being left further up the
  // page while a timer they cannot see runs down. The container is focusable
  // but not a focus trap: the check expires on its own and trapping focus in
  // something that self-dismisses strands the user.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const mount = Date.now();
    const interval = setInterval(() => {
      const left = hasClock
        ? remainingFromClock()
        : Math.max(windowSec - (Date.now() - mount) / 1000, 0);
      setRemaining(left);
      if (left <= 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
    // remainingFromClock reads only stable inputs (challenge, startedAtMs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSec, hasClock, startedAtMs, challenge.validUntil]);

  const fractionLeft = windowSec > 0 ? remaining / windowSec : 0;
  const expired = remaining <= 0;
  const clockColor =
    fractionLeft > 0.5
      ? "#4ade80"
      : fractionLeft > 0.25
        ? "#fbbf24"
        : "#ef4444";

  const handlePick = (option: string) => {
    if (picked || expired) return;
    setPicked(option);
    setSubmitError(null);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(50);
    }
    void Promise.resolve(onAnswer(option)).catch(() => {
      // A transport/session failure is retryable. An invalid answer resolves
      // normally and is intentionally handled by the proof receipt instead.
      setPicked(null);
      setSubmitError("Couldn’t submit that check. Try again.");
    });
  };

  return (
    <motion.div
      className="attn"
      ref={rootRef}
      tabIndex={-1}
      role="group"
      aria-labelledby="attn-question"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="attn__veil" aria-hidden="true" />

      {/* The countdown spans the viewport. Extent is the data; there is no
          widget to put in a header. */}
      <div
        className="attn__clock"
        aria-hidden="true"
        style={{ ["--left" as string]: fractionLeft }}
      >
        <i style={{ background: clockColor }} />
      </div>

      <motion.div
        className="attn__body"
        initial={{ y: 28 }}
        animate={{ y: 0 }}
        exit={{ y: 16 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
      >
        <p className="attn__eyebrow">
          <i style={{ background: brandColor, color: brandColor }} />
          Attention check
          <span
            className="attn__remaining"
            role="timer"
            aria-label={`${Math.ceil(remaining)} seconds left to answer`}
          >
            {Math.ceil(remaining)}s
          </span>
        </p>

        <h2 className="attn__question" id="attn-question">
          {challenge.question}
        </h2>

        {challenge.options && (
          <ul className="attn__options">
            {challenge.options.map((option, i) => {
              const isPicked = picked === option;
              return (
                <li key={option}>
                  <button
                    type="button"
                    className={`attn__option${isPicked ? " is-picked" : ""}`}
                    style={{
                      // The wash is always the answer's own colour from the
                      // fixed palette, never the brand's. Brands supply their
                      // own primaryColor and a dark one would put ink text on
                      // a dark fill; brand presence comes from the veil tint
                      // and the eyebrow dot instead, where it cannot break
                      // contrast on a control.
                      ["--wash" as string]: ANSWER_WASH[i % ANSWER_WASH.length],
                    }}
                    onClick={() => handlePick(option)}
                    disabled={!!picked || expired}
                    aria-pressed={isPicked}
                  >
                    <span
                      className="attn__marker"
                      style={{
                        background: ANSWER_WASH[i % ANSWER_WASH.length],
                      }}
                      aria-hidden="true"
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="attn__answer">{option}</span>
                    {isPicked && (
                      <span className="attn__tick" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {submitError && (
          <p className="attn__submit-error" role="alert">
            {submitError}
          </p>
        )}

        {expired && !picked && (
          <div className="attn__expired" role="status">
            <p>Time&apos;s up — better luck on the next one.</p>
            {onExpired && (
              <button
                type="button"
                className="attn__continue"
                onClick={() => onExpiredRef.current?.()}
              >
                Continue
              </button>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
