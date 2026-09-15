"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const HINT_STORAGE_KEY = "slop-keyhint-seen";

/**
 * Keyboard shortcuts for the big screen.
 *
 * `T` is already handled by `useTheaterMode` (it toggles theater mode
 * and updates the URL). This hook adds:
 *   · `M`  — toggle mute
 *   · `Escape` — exit theater mode (only when theater is on)
 *
 * Both skip when the user is typing in an input or textarea. Callbacks are
 * stored in a ref so the keydown listener is attached once — even if the
 * parent re-renders with new (non-memoized) callback identities.
 */
export function useKeyboardShortcuts({
  onToggleMute,
  onExitTheater,
  theater,
}: {
  onToggleMute: () => void;
  onExitTheater: () => void;
  theater: boolean;
}) {
  const callbacks = useRef({ onToggleMute, onExitTheater, theater });
  callbacks.current = { onToggleMute, onExitTheater, theater };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const { onToggleMute, onExitTheater, theater } = callbacks.current;
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        onToggleMute();
      } else if (e.key === "Escape" && theater) {
        e.preventDefault();
        onExitTheater();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

/**
 * A subtle, one-shot keyboard hint that appears after a short delay.
 * Shows the available shortcuts (T for theater, M for mute) with <kbd>
 * elements, then auto-dismisses. Uses localStorage so it never shows again
 * after the first dismissal or natural timeout.
 *
 * Positioned at the bottom-center so it doesn't collide with the existing
 * HUD chrome (leaderboard right, stats left, threshold center-bottom). It
 * only renders when theater mode is OFF — in theater, the whole point is
 * a clean canvas.
 */
export function KeyboardHint({ theater }: { theater: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (theater) {
      setVisible(false);
      return;
    }

    let seen = false;
    try {
      seen = window.localStorage.getItem(HINT_STORAGE_KEY) === "1";
    } catch {
      // Private mode — still show for this session.
    }
    if (seen) return;

    const showTimer = window.setTimeout(() => setVisible(true), 3500);
    const hideTimer = window.setTimeout(() => {
      setVisible(false);
      try {
        window.localStorage.setItem(HINT_STORAGE_KEY, "1");
      } catch {
        // Private mode — still hide for this session.
      }
    }, 14000);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [theater]);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(HINT_STORAGE_KEY, "1");
    } catch {
      // Private mode.
    }
  };

  return (
    <AnimatePresence>
      {visible && !theater && (
        <motion.button
          className="slop-keyhint"
          onClick={dismiss}
          aria-label="Keyboard shortcuts: T for theater mode, M for mute. Click to dismiss."
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <kbd>T</kbd>
          <span>theater</span>
          <span className="slop-keyhint__sep" aria-hidden>
            ·
          </span>
          <kbd>M</kbd>
          <span>mute</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
