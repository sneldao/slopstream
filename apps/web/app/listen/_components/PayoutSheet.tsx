"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Stub payout sheet — clarifies pending vs available without a real rails
 * integration yet. Demo/local balances only.
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
            <div className="slop-payout-sheet__kicker">Listener rewards</div>
            <h2>How you get paid</h2>
            <p>
              Verified attention lands in <strong>pending</strong> until a
              segment clears. Cleared rewards move to <strong>available</strong>
              — then you can request a payout.
            </p>

            <div className="slop-payout-sheet__rows">
              <div>
                <span>Pending (awaiting pool close)</span>
                <strong>${pendingUsd.toFixed(2)}</strong>
              </div>
              <div>
                <span>Available to cash out</span>
                <strong>${availableUsd.toFixed(2)}</strong>
              </div>
            </div>

            {done ? (
              <p className="slop-payout-sheet__done" role="status">
                Payout requested — funds leave your available balance. Real
                rails come next.
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
                  ? `Request $${availableUsd.toFixed(2)} payout`
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
