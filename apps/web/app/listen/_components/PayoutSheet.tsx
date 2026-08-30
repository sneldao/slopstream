"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Stub payout sheet — pending vs available, then cash out.
 */
export function PayoutSheet({
  availableUsd,
  pendingUsd,
  open,
  onClose,
  onRequest,
}: {
  availableUsd: number;
  pendingUsd: number;
  open: boolean;
  onClose: () => void;
  onRequest: () => void | Promise<void>;
}) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) setDone(false);
  }, [open]);

  const canCashOut = availableUsd > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="slop-payout-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Request payout"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="slop-payout-sheet"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="slop-payout-sheet__kicker">Payout</div>
            <h2>Cash out</h2>
            <p>Pending until clear. Then available.</p>

            <div className="slop-payout-sheet__rows">
              <div>
                <span>Pending</span>
                <strong>${pendingUsd.toFixed(2)}</strong>
              </div>
              <div>
                <span>Available</span>
                <strong>${availableUsd.toFixed(2)}</strong>
              </div>
            </div>

            {done ? (
              <p className="slop-payout-sheet__done" role="status">
                Requested — demo holds funds locally.
              </p>
            ) : (
              <button
                type="button"
                className="slop-payout-sheet__cta"
                disabled={!canCashOut}
                onClick={() => {
                  void (async () => {
                    await onRequest();
                    setDone(true);
                  })();
                }}
              >
                {canCashOut
                  ? `Request $${availableUsd.toFixed(2)}`
                  : "Nothing available yet"}
              </button>
            )}

            <button
              type="button"
              className="slop-payout-sheet__close"
              onClick={onClose}
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
