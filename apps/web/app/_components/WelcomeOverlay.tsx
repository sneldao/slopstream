"use client";

import { motion, AnimatePresence } from "framer-motion";

/**
 * The welcome overlay — the first touch. A cream veil over the Continuum
 * with the Slopstream wordmark, a one-line pitch, and a single pulsing
 * call-to-action. Unlocks audio on click, then lifts away to reveal the
 * living world beneath.
 *
 * This replaces the old dark, generic start button with a branded moment
 * that sets the tone: you are about to enter a living attention market,
 * not click through a gate.
 *
 * Design: the overlay uses the Continuum's cream/ink palette (not the
 * platform's dark surface) so the transition into the world is seamless —
 * the veil lifts and the world is already there, already cream, already
 * alive. Three floating spheres echo the homepage's platform orbs so the
 * brand identity reads instantly.
 */
export function WelcomeOverlay({
  onEnter,
  visible,
}: {
  onEnter: () => void;
  visible: boolean;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          className="slop-welcome"
          onClick={onEnter}
          aria-label="Enter the Slopstream live attention market"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03, filter: "blur(10px)" }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Floating spheres — echo the homepage's platform orbs so the
              brand identity reads before the world is even visible. */}
          <div className="slop-welcome__spheres" aria-hidden>
            <span className="slop-welcome__orb slop-welcome__orb--coral" />
            <span className="slop-welcome__orb slop-welcome__orb--blue" />
            <span className="slop-welcome__orb slop-welcome__orb--lime" />
          </div>

          <motion.div
            className="slop-welcome__content"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="slop-welcome__wordmark">Slopstream</div>
            <div className="slop-welcome__tagline">
              The live attention market
            </div>

            <div className="slop-welcome__enter">
              <span>Enter the stream</span>
              <span aria-hidden className="slop-welcome__arrow">
                →
              </span>
            </div>

            <div className="slop-welcome__hint">
              Brands bid · AI creates · You verify · Everyone earns
            </div>
          </motion.div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
