"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * One-shot coach card. Dismisses forever via localStorage so demos stay clean
 * after the first visit.
 */
export function FirstRunCoach({
  storageKey,
  title,
  steps,
}: {
  storageKey: string;
  title: string;
  steps: string[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === "1") return;
      setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [storageKey]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Private mode — still close for this session.
    }
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className="slop-coach"
          role="dialog"
          aria-label={title}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ type: "spring", stiffness: 280, damping: 22 }}
        >
          <div className="slop-coach__top">
            <strong>{title}</strong>
            <button
              type="button"
              className="slop-coach__dismiss"
              onClick={dismiss}
            >
              Got it
            </button>
          </div>
          <ol className="slop-coach__steps">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
