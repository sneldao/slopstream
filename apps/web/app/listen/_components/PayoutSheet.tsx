"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { errorMessage } from "@/lib/errors";

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
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDone(false);
      setError(null);
      setRequesting(false);
    }
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
                Requested — payout submitted.
              </p>
            ) : (
              <button
                type="button"
                className="slop-payout-sheet__cta"
                disabled={!canCashOut || requesting}
                onClick={() => {
                  setError(null);
                  setRequesting(true);
                  void (async () => {
                    try {
                      await onRequest();
                      setDone(true);
                    } catch (err: unknown) {
                      // Handled here so a failed payout never becomes an
                      // unhandled promise rejection.
                      setError(errorMessage(err, "Unable to request payout."));
                    } finally {
                      setRequesting(false);
                    }
                  })();
                }}
              >
                {requesting
                  ? "Requesting…"
                  : canCashOut
                    ? `Request $${availableUsd.toFixed(2)}`
                    : "Nothing available yet"}
              </button>
            )}

            {error && (
              <p className="slop-payout-sheet__error" role="alert">
                {error}
              </p>
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
